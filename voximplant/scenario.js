(function () {
  require(Modules.ElevenLabs);

  /**
   * ========= SIP / ROUTING CONFIG =========
   */
  var DEST_REG_ID = 101394;
  var LIVE_AGENT_SIP_DEFAULT = "sip:442070968310@sip.pbxdiamondcall.com";
  var LIVE_AGENT_REG_ID = 101394;
  var RING_TIMEOUT_SECONDS = 30;

  /**
   * ========= ELEVENLABS CONFIG =========
   */
  var ELEVENLABS_API_KEY = "sk_fb4421b5d53ebd5a04e5dc43c5ca157df764085329b79d80";
  var ELEVENLABS_AGENT_ID_EN = "agent_2201khk96pkjfqmbmgs7z765y5ts";
  var ELEVENLABS_AGENT_ID_IT = "agent_2501khnaf99ae0wbd7bpddvt2bsj";
  var ELEVENLABS_AGENT_ID_ES = "agent_2201khk96pkjfqmbmgs7z765y5ts";

  /**
   * ========= SILENCE WATCHDOG =========
   */
  var SILENCE_PRE_TRANSFER_MS = 60 * 1000;
  var SILENCE_POST_TRANSFER_MS = 180 * 1000;

  // ---- STATE ----
  var silenceWindowMs = SILENCE_PRE_TRANSFER_MS;
  var silenceTimer = null;
  var hangupAllFn = null;

  function resetSilenceTimer(log) {
    if (silenceTimer) clearTimeout(silenceTimer);
    var windowMs = silenceWindowMs;
    silenceTimer = setTimeout(function () {
      log("=== SILENCE_TIMEOUT_" + Math.round(windowMs / 1000) + "S: HANGUP_ALL ===");
      try { if (hangupAllFn) hangupAllFn(); } catch (_) {}
    }, windowMs);
  }

  function pickElevenLabsAgentId(agentType) {
    if (agentType === 2) return ELEVENLABS_AGENT_ID_IT;
    if (agentType === 3) return ELEVENLABS_AGENT_ID_ES;
    return ELEVENLABS_AGENT_ID_EN;
  }

  function parseElevenLabsToolCall(event) {
    var rawText = event && event.text ? event.text : null;
    var maybeObj = (event && event.data) ? event.data : null;
    var obj = null;
    if (rawText) {
      try { obj = JSON.parse(rawText); } catch (_) { obj = null; }
    }
    if (!obj && maybeObj) obj = maybeObj;
    if (!obj) return { tool: "", args: {} };

    var ctc = obj.payload && obj.payload.client_tool_call
      ? obj.payload.client_tool_call : null;
    if (!ctc) return { tool: "", args: {} };

    return {
      tool: String(ctc.tool_name || ""),
      args: ctc.arguments || ctc.args || ctc.parameters || ctc.params || {}
    };
  }

  // ================================================================
  // MAIN
  // ================================================================
  VoxEngine.addEventListener(AppEvents.Started, function () {
    (async function () {
      var raw = VoxEngine.customData();
      var data = raw ? JSON.parse(raw) : {};

      var LEAD_ID        = data.lead_id || null;
      var CAMPAIGN_ID    = data.campaign_id || null;
      var CAMPAIGN_NAME  = data.campaign || "";
      var PHONE          = (data.phone || "").replace(/[^0-9]/g, "");
      // Strip trunk prefix 0 after UK country code (4407... → 447...)
      if (PHONE.indexOf("440") === 0) PHONE = "44" + PHONE.substring(3);
      var NAME           = data.name || "there";
      var FUNNEL         = data.funnel || "";
      var CALLER_ID      = data.caller_id || "";
      var AGENT_TYPE     = data.agent_type || 1;
      var SCRIPT_BODY    = data.script_body || "";
      var DETECTOR_BODY  = data.detector_body || "";
      var WEBHOOK_URL    = data.webhook_url || "";
      var WEBHOOK_SECRET = data.webhook_secret || "";
      var LIVE_AGENT_SIP = data.agent_phone
        ? "sip:" + data.agent_phone + "@sip.pbxdiamondcall.com"
        : LIVE_AGENT_SIP_DEFAULT;

      var call = null;
      var aiClient = null;
      var agentCall = null;
      var transferred = false;
      var callEndedSent = false;
      var humanConfirmed = false;
      var callStartTime = null;
      var transcript = [];
      var CALL_ID = "";

      function log(obj) {
        Logger.write(typeof obj === "string" ? obj : JSON.stringify(obj));
      }

      log("=== SCENARIO START === lead_id=" + LEAD_ID + " phone=" + PHONE +
          " name=" + NAME + " campaign_id=" + CAMPAIGN_ID + " agent_type=" + AGENT_TYPE +
          " script_body_length=" + SCRIPT_BODY.length +
          " detector_body_length=" + DETECTOR_BODY.length);

      // ---- Webhook helper ----
      async function sendWebhook(eventType, extraData) {
        if (!WEBHOOK_URL) return;
        var payload = {
          event: eventType,
          lead_id: LEAD_ID,
          call_id: CALL_ID,
          phone: PHONE
        };
        if (extraData) {
          for (var k in extraData) payload[k] = extraData[k];
        }
        var body = JSON.stringify(payload);
        try {
          var res = await Net.httpRequestAsync(WEBHOOK_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Voximplant-Signature": WEBHOOK_SECRET
            },
            postData: body,
            timeout: 10,
            connectionTimeout: 6
          });
          log("Webhook " + eventType + " sent, code=" + res.code);
        } catch (e) {
          log("Webhook " + eventType + " FAILED: " + e);
        }
      }

      function buildTranscriptText() {
        return transcript.map(function (t) {
          return (t.role === "user" ? "Lead" : "AI") + ": " + t.text;
        }).join("\n");
      }

      function cleanupAI() {
        try { if (aiClient) aiClient.close(); } catch (_) {}
        aiClient = null;
      }

      function terminateScenario() {
        VoxEngine.terminate();
      }

      function hangupAll() {
        if (!callEndedSent) {
          callEndedSent = true;
          var duration = callStartTime
            ? Math.round((Date.now() - callStartTime) / 1000) : 0;
          sendWebhook("call_ended", { duration_seconds: duration }).catch(function () {});
        }

        if (silenceTimer) clearTimeout(silenceTimer);
        try { if (call) call.hangup(); } catch (_) {}
        try { if (agentCall) agentCall.hangup(); } catch (_) {}
        cleanupAI();
        setTimeout(terminateScenario, 2000);
      }
      hangupAllFn = hangupAll;

      // ---- Transfer to live agent ----
      function transferToLiveAgent(reason) {
        if (transferred) return;
        transferred = true;

        log("=== TRANSFER_TO_LIVE_AGENT reason=" + reason + " ===");

        silenceWindowMs = SILENCE_POST_TRANSFER_MS;
        resetSilenceTimer(log);

        sendWebhook("ai_classification", {
          classification: "activation_requested",
          confidence: 1.0,
          transcript: buildTranscriptText(),
          summary: reason || "Lead requested transfer to agent"
        }).catch(function () {});

        cleanupAI();

        agentCall = VoxEngine.callSIP(LIVE_AGENT_SIP, { regId: LIVE_AGENT_REG_ID });

        agentCall.addEventListener(CallEvents.Failed, function (e) {
          log("=== AGENT_CALL_FAILED ===");
          log(e);
          try {
            call.say("Sorry, I couldn't reach an advisor right now.");
          } catch (_) {}
          call.addEventListener(CallEvents.PlaybackFinished, function () {
            hangupAll();
          });
        });

        agentCall.addEventListener(CallEvents.Connected, function () {
          log("=== AGENT_CONNECTED: BRIDGING ===");
          VoxEngine.sendMediaBetween(call, agentCall);
          resetSilenceTimer(log);
          sendWebhook("transfer_started", {}).catch(function () {});
        });

        var endAll = function () {
          sendWebhook("transfer_completed", {
            outcome: "completed"
          }).catch(function () {});
          hangupAll();
        };
        call.addEventListener(CallEvents.Disconnected, endAll);
        agentCall.addEventListener(CallEvents.Disconnected, endAll);
      }

      // ================================================================
      // 1) Place outbound SIP call
      // ================================================================
      var SIP_LEAD = "sip:" + PHONE + "@sip.pbxdiamondcall.com";
      call = VoxEngine.callSIP(SIP_LEAD, {
        regId: DEST_REG_ID,
        timeout: RING_TIMEOUT_SECONDS
      });
      CALL_ID = call.id();

      silenceWindowMs = SILENCE_PRE_TRANSFER_MS;
      resetSilenceTimer(log);

      call.addEventListener(CallEvents.Connected, function () {
        resetSilenceTimer(log);
      });

      call.addEventListener(CallEvents.Failed, function (e) {
        log("=== CALL_FAILED code=" + (e.code || "") + " reason=" + (e.reason || "") + " ===");
        callEndedSent = true;
        sendWebhook("no_answer", {}).catch(function () {});
        sendWebhook("call_ended", { duration_seconds: 0 }).catch(function () {});
        if (silenceTimer) clearTimeout(silenceTimer);
        setTimeout(terminateScenario, 2000);
      });

      call.addEventListener(CallEvents.Disconnected, function () {
        log("=== CALL_DISCONNECTED ===");
        if (!transferred) {
          hangupAll();
        }
      });

      // ================================================================
      // 2) Audio starts -> Single agent handles detection + conversation
      //    No two-stage swap. One agent, one WebSocket, zero delay.
      // ================================================================
      call.addEventListener(CallEvents.AudioStarted, async function () {
        log("=== AUDIO_STARTED — Starting single AI agent ===");
        callStartTime = Date.now();
        resetSilenceTimer(log);
        sendWebhook("call_started", {}).catch(function () {});

        try {
          var agentId = pickElevenLabsAgentId(AGENT_TYPE);
          if (!ELEVENLABS_API_KEY || !agentId) {
            log("ERROR: Missing ElevenLabs config");
            hangupAll();
            return;
          }

          var agentOptions = {
            xiApiKey: ELEVENLABS_API_KEY,
            agentId: agentId,
            dynamicVariables: {
              name: NAME,
              campaign: CAMPAIGN_NAME,
              funnel: FUNNEL
            },
            onWebSocketClose: function (event) {
              log("=== AI_WS_CLOSE ===");
              if (transferred) return;
              hangupAll();
            }
          };

          // Build combined prompt: detector preamble + script body
          var fullPrompt = SCRIPT_BODY;
          if (DETECTOR_BODY && SCRIPT_BODY) {
            fullPrompt = DETECTOR_BODY + "\n\n---\n\nOnce you have confirmed a human is on the line, proceed with the following script:\n\n" + SCRIPT_BODY;
          } else if (DETECTOR_BODY) {
            fullPrompt = DETECTOR_BODY;
          }

          aiClient = await ElevenLabs.createConversationalAIClient(agentOptions);

          // Override prompt via conversationInitiationClientData (not constructor options)
          if (fullPrompt) {
            aiClient.conversationInitiationClientData({
              conversation_config_override: {
                agent: {
                  prompt: {
                    prompt: fullPrompt
                  }
                }
              }
            });
            log("=== Prompt override applied via conversationInitiationClientData (" + fullPrompt.length + " chars) ===");
          }

          VoxEngine.sendMediaBetween(call, aiClient);

          // ---- Transcript tracking ----
          aiClient.addEventListener(
            ElevenLabs.ConversationalAIEvents.UserTranscript,
            function (event) {
              var text = (event && event.text) || "";
              if (text) transcript.push({ role: "user", text: text });
              resetSilenceTimer(log);
            }
          );

          aiClient.addEventListener(
            ElevenLabs.ConversationalAIEvents.AgentResponse,
            function (event) {
              var text = (event && event.text) || "";
              if (text) transcript.push({ role: "agent", text: text });
              resetSilenceTimer(log);
            }
          );

          aiClient.addEventListener(
            ElevenLabs.ConversationalAIEvents.AgentResponseCorrection,
            function (event) {
              resetSilenceTimer(log);
            }
          );

          aiClient.addEventListener(
            ElevenLabs.ConversationalAIEvents.Interruption,
            function (event) {
              try { if (aiClient) aiClient.clearMediaBuffer(); } catch (_) {}
              resetSilenceTimer(log);
            }
          );

          // ---- Tool calls ----
          aiClient.addEventListener(
            ElevenLabs.ConversationalAIEvents.ClientToolCall,
            function (event) {
              log("=== AI.ClientToolCall ===");
              log(event);

              var parsed = parseElevenLabsToolCall(event);
              var tool = (parsed.tool || "").toLowerCase();
              var args = parsed.args || {};

              // ---- HUMAN DETECTED (webhook only, agent keeps talking) ----
              if (tool === "transfer_connected") {
                if (!humanConfirmed) {
                  humanConfirmed = true;
                  log("=== HUMAN CONFIRMED ===");
                  sendWebhook("human_detected", {}).catch(function () {});
                }
                return;
              }

              // ---- VOICEMAIL DETECTED -> hangup ----
              if (tool === "voicemail_detected") {
                log("=== VOICEMAIL DETECTED — hanging up ===");
                sendWebhook("voicemail_detected", {}).catch(function () {});
                hangupAll();
                return;
              }

              // ---- TRANSFER TO LIVE AGENT ----
              if (
                tool === "transfer_to_agent" ||
                tool === "forward_to_agent" ||
                tool === "transfer_to_number"
              ) {
                transferToLiveAgent(args.reason || "AI tool: " + tool);
                return;
              }

              // ---- BOOK APPOINTMENT ----
              if (tool === "book_appointment") {
                var apptDate = args.appointment_date || "";
                var apptNotes = args.notes || "";
                log("=== BOOK_APPOINTMENT date=" + apptDate + " notes=" + apptNotes + " ===");
                sendWebhook("ai_classification", {
                  classification: "appointment_booked",
                  confidence: 1.0,
                  transcript: buildTranscriptText(),
                  summary: "Appointment booked for " + apptDate,
                  appointment_date: apptDate,
                  appointment_notes: apptNotes
                }).catch(function () {});
                // Give AI 8s to confirm with lead, then hang up
                setTimeout(function () { hangupAll(); }, 8000);
                return;
              }

              // ---- END CALL ----
              if (
                tool === "end_call" ||
                tool === "hangup_call" ||
                tool === "hangup" ||
                tool.indexOf("end_call") !== -1 ||
                tool.indexOf("hangup") !== -1
              ) {
                var disposition = args.disposition || "not_interested";
                log("=== END_CALL disposition=" + disposition + " reason=" + (args.reason || "") + " ===");

                // Treat voicemail disposition as voicemail webhook
                if (disposition === "voicemail") {
                  sendWebhook("voicemail_detected", {}).catch(function () {});
                } else {
                  sendWebhook("ai_classification", {
                    classification: disposition,
                    confidence: 1.0,
                    transcript: buildTranscriptText(),
                    summary: args.reason || "AI ended the call"
                  }).catch(function () {});
                }
                hangupAll();
                return;
              }
            }
          );

          aiClient.addEventListener(
            ElevenLabs.ConversationalAIEvents.ConversationInitiationMetadata,
            function (event) { log("=== AI.ConversationInitiationMetadata ==="); }
          );

          log("=== AI agent connected and listening ===");

        } catch (error) {
          log("=== AI_ERROR: " + String(error) + " ===");
          hangupAll();
        }
      });

    })().catch(function (e) {
      Logger.write("FATAL: " + e);
      VoxEngine.terminate();
    });
  });
})();
