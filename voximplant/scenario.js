(function () {
  require(Modules.ElevenLabs);

  /**
   * ========= SIP / ROUTING CONFIG =========
   */
  var DEST_REG_ID = 101394;
  var LIVE_AGENT_SIP = "sip:442070968310@sip.pbxdiamondcall.com";
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
   * ========= DETECTOR PROMPT (Stage 1 — tiny, cheap) =========
   */
  var DETECTOR_PROMPT =
    "You are a call connection detector. Your ONLY job is to determine if a real human answered or if it went to voicemail.\n\n" +
    "RULES:\n" +
    "- Stay completely SILENT. Do NOT speak, do NOT greet, do NOT say anything.\n" +
    "- Just listen to the audio.\n" +
    "- If you hear a real human voice (someone saying hello, yes, pronto, si, or any human greeting), IMMEDIATELY call the transfer_connected tool.\n" +
    "- If you hear a voicemail greeting, an automated message, a beep tone, or a recorded message, IMMEDIATELY call the voicemail_detected tool.\n" +
    "- If you hear nothing (silence) for more than 5 seconds, say 'Hello?' once and wait.\n" +
    "- If still nothing after another 5 seconds, call the voicemail_detected tool.\n" +
    "- You must call one of the two tools within 10 seconds. Never engage in conversation.";

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
      // ---- Parse customData from our call engine ----
      var raw = VoxEngine.customData();
      var data = raw ? JSON.parse(raw) : {};

      var LEAD_ID        = data.lead_id || null;
      var CAMPAIGN_ID    = data.campaign_id || null;
      var CAMPAIGN_NAME  = data.campaign || "";
      var PHONE          = data.phone || "";
      var NAME           = data.name || "there";
      var FUNNEL         = data.funnel || "";
      var CALLER_ID      = data.caller_id || "";
      var AGENT_TYPE     = data.agent_type || 1;
      var SCRIPT_BODY    = data.script_body || "";
      var CUSTOM_DETECTOR = data.detector_body || "";
      var WEBHOOK_URL    = data.webhook_url || "";
      var WEBHOOK_SECRET = data.webhook_secret || "";

      // ---- Call state ----
      var call = null;
      var detectorClient = null;       // Stage 1: tiny detector
      var conversationalAIClient = null; // Stage 2: full agent
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
          " custom_detector_length=" + CUSTOM_DETECTOR.length);

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

      // ---- Cleanup helpers ----
      function cleanupDetector() {
        try { if (detectorClient) detectorClient.close(); } catch (_) {}
        detectorClient = null;
      }

      function cleanupMainAgent() {
        try { if (conversationalAIClient) conversationalAIClient.close(); } catch (_) {}
        conversationalAIClient = null;
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
        cleanupDetector();
        cleanupMainAgent();
        setTimeout(terminateScenario, 2000);
      }
      hangupAllFn = hangupAll;

      // ================================================================
      // STAGE 2: Start the full agent (only called after human confirmed)
      // ================================================================
      async function startFullAgent() {
        log("=== STAGE 2: Starting full ElevenLabs agent ===");

        var agentId = pickElevenLabsAgentId(AGENT_TYPE);

        var fullAgentOptions = {
          xiApiKey: ELEVENLABS_API_KEY,
          agentId: agentId,
          dynamicVariables: {
            name: NAME,
            campaign: CAMPAIGN_NAME,
            funnel: FUNNEL
          },
          onWebSocketClose: function (event) {
            log("=== FULL_AGENT_WS_CLOSE ===");
            if (transferred) return;
            hangupAll();
          }
        };

        // Override system prompt with script_body from backend
        if (SCRIPT_BODY) {
          fullAgentOptions.overrides = {
            agent: {
              prompt: {
                prompt: SCRIPT_BODY
              }
            }
          };
          log("=== SCRIPT_BODY override applied (" + SCRIPT_BODY.length + " chars) ===");
        }

        conversationalAIClient = await ElevenLabs.createConversationalAIClient(fullAgentOptions);

        VoxEngine.sendMediaBetween(call, conversationalAIClient);

        // ---- Transcript tracking ----
        conversationalAIClient.addEventListener(
          ElevenLabs.ConversationalAIEvents.UserTranscript,
          function (event) {
            var text = (event && event.text) || "";
            if (text) transcript.push({ role: "user", text: text });
            resetSilenceTimer(log);
          }
        );

        conversationalAIClient.addEventListener(
          ElevenLabs.ConversationalAIEvents.AgentResponse,
          function (event) {
            var text = (event && event.text) || "";
            if (text) transcript.push({ role: "agent", text: text });
            resetSilenceTimer(log);
          }
        );

        conversationalAIClient.addEventListener(
          ElevenLabs.ConversationalAIEvents.AgentResponseCorrection,
          function (event) {
            resetSilenceTimer(log);
          }
        );

        conversationalAIClient.addEventListener(
          ElevenLabs.ConversationalAIEvents.Interruption,
          function (event) {
            try { if (conversationalAIClient) conversationalAIClient.clearMediaBuffer(); } catch (_) {}
            resetSilenceTimer(log);
          }
        );

        // ---- Tool calls from full agent ----
        conversationalAIClient.addEventListener(
          ElevenLabs.ConversationalAIEvents.ClientToolCall,
          function (event) {
            log("=== FullAgent.ClientToolCall ===");
            log(event);

            var parsed = parseElevenLabsToolCall(event);
            var tool = (parsed.tool || "").toLowerCase();
            var args = parsed.args || {};

            // ---- TRANSFER TO LIVE AGENT ----
            if (
              tool === "transfer_to_agent" ||
              tool === "forward_to_agent" ||
              tool === "transfer_to_number"
            ) {
              transferToLiveAgent(args.reason || "AI tool: " + tool);
              return;
            }

            // ---- END CALL (with disposition) ----
            if (
              tool === "end_call" ||
              tool === "hangup_call" ||
              tool === "hangup" ||
              tool.indexOf("end_call") !== -1 ||
              tool.indexOf("hangup") !== -1
            ) {
              var disposition = args.disposition || "not_interested";
              log("=== END_CALL disposition=" + disposition + " reason=" + (args.reason || "") + " ===");

              sendWebhook("ai_classification", {
                classification: disposition,
                confidence: 1.0,
                transcript: buildTranscriptText(),
                summary: args.reason || "AI ended the call"
              }).catch(function () {});
              hangupAll();
              return;
            }
          }
        );

        conversationalAIClient.addEventListener(
          ElevenLabs.ConversationalAIEvents.ConversationInitiationMetadata,
          function (event) { log("=== FullAgent.ConversationInitiationMetadata ==="); }
        );

        log("=== STAGE 2: Full agent connected and listening ===");
      }

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

        cleanupMainAgent();

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
      // 1) Place outbound SIP call (with ring timeout)
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
      // 2) Audio starts -> STAGE 1: Start tiny detector agent
      //    Detector only listens for human vs voicemail.
      //    If human confirmed -> close detector -> start full agent.
      // ================================================================
      call.addEventListener(CallEvents.AudioStarted, async function () {
        log("=== AUDIO_STARTED — STAGE 1: Starting detector agent ===");
        callStartTime = Date.now();
        resetSilenceTimer(log);

        try {
          var agentId = pickElevenLabsAgentId(AGENT_TYPE);
          if (!ELEVENLABS_API_KEY || !agentId) {
            log("ERROR: Missing ElevenLabs config");
            hangupAll();
            return;
          }

          // Stage 1: Tiny detector with minimal prompt
          detectorClient = await ElevenLabs.createConversationalAIClient({
            xiApiKey: ELEVENLABS_API_KEY,
            agentId: agentId,
            overrides: {
              agent: {
                prompt: {
                  prompt: CUSTOM_DETECTOR || DETECTOR_PROMPT
                }
              }
            },
            onWebSocketClose: function (event) {
              log("=== DETECTOR_WS_CLOSE ===");
              // Only hangup if we haven't moved to stage 2
              if (!humanConfirmed && !transferred) {
                hangupAll();
              }
            }
          });

          VoxEngine.sendMediaBetween(call, detectorClient);

          // ---- Detector tool calls ----
          detectorClient.addEventListener(
            ElevenLabs.ConversationalAIEvents.ClientToolCall,
            function (event) {
              log("=== Detector.ClientToolCall ===");
              log(event);

              var parsed = parseElevenLabsToolCall(event);
              var tool = (parsed.tool || "").toLowerCase();
              var args = parsed.args || {};

              // ---- HUMAN CONFIRMED -> switch to full agent ----
              if (tool === "transfer_connected") {
                if (!humanConfirmed) {
                  humanConfirmed = true;
                  log("=== STAGE 1: HUMAN CONFIRMED — switching to full agent ===");

                  // Send human_detected webhook
                  sendWebhook("human_detected", {}).catch(function () {});

                  // Close detector, start full agent
                  cleanupDetector();
                  startFullAgent().catch(function (err) {
                    log("=== STAGE 2 FAILED: " + String(err) + " ===");
                    hangupAll();
                  });
                }
                return;
              }

              // ---- VOICEMAIL DETECTED -> hangup ----
              if (tool === "voicemail_detected") {
                log("=== STAGE 1: VOICEMAIL DETECTED — hanging up ===");
                sendWebhook("voicemail_detected", {}).catch(function () {});
                hangupAll();
                return;
              }

              // ---- Fallback: end_call from detector ----
              if (
                tool === "end_call" ||
                tool === "hangup_call" ||
                tool === "hangup" ||
                tool.indexOf("end_call") !== -1 ||
                tool.indexOf("hangup") !== -1
              ) {
                log("=== STAGE 1: Detector ended call ===");
                sendWebhook("voicemail_detected", {}).catch(function () {});
                hangupAll();
                return;
              }
            }
          );

          detectorClient.addEventListener(
            ElevenLabs.ConversationalAIEvents.ConversationInitiationMetadata,
            function (event) { log("=== Detector.ConversationInitiationMetadata ==="); }
          );

          log("=== STAGE 1: Detector agent connected and listening ===");

        } catch (error) {
          log("=== DETECTOR_ERROR: " + String(error) + " ===");
          hangupAll();
        }
      });

    })().catch(function (e) {
      Logger.write("FATAL: " + e);
      VoxEngine.terminate();
    });
  });
})();
