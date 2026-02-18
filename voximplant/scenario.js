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
  // Full agents (Stage 2) — these have transfer_to_agent + end_call tools
  var ELEVENLABS_AGENT_ID_EN = "agent_2201khk96pkjfqmbmgs7z765y5ts";
  var ELEVENLABS_AGENT_ID_IT = "agent_2501khnaf99ae0wbd7bpddvt2bsj";
  var ELEVENLABS_AGENT_ID_ES = "agent_2201khk96pkjfqmbmgs7z765y5ts";

  // Detector agents (Stage 1) — these have transfer_connected + voicemail_detected tools only
  var ELEVENLABS_DETECTOR_AGENT_ID_EN = "agent_0001khr360arekfb4bszmeerxp97";
  var ELEVENLABS_DETECTOR_AGENT_ID_IT = "agent_0001khr360arekfb4bszmeerxp97";
  var ELEVENLABS_DETECTOR_AGENT_ID_ES = "agent_0001khr360arekfb4bszmeerxp97";

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

  function pickDetectorAgentId(agentType) {
    if (agentType === 2) return ELEVENLABS_DETECTOR_AGENT_ID_IT;
    if (agentType === 3) return ELEVENLABS_DETECTOR_AGENT_ID_ES;
    return ELEVENLABS_DETECTOR_AGENT_ID_EN;
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
      var conversationalAIClient = null; // Stage 2: full agent (pre-connected)
      var fullAgentReady = false;       // true once Stage 2 WS is open
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
        fullAgentReady = false;
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
      // PRE-CONNECT Stage 2 full agent (runs in background during Stage 1)
      // Does NOT send media yet — just establishes the WebSocket so it's
      // ready for instant swap when human is confirmed.
      // ================================================================
      function preConnectFullAgent() {
        log("=== PRE-CONNECT: Starting full agent WebSocket in background ===");

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
            // Only hangup if we already switched to this agent
            if (humanConfirmed) {
              hangupAll();
            }
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

        ElevenLabs.createConversationalAIClient(fullAgentOptions)
          .then(function (client) {
            conversationalAIClient = client;
            fullAgentReady = true;
            log("=== PRE-CONNECT: Full agent WebSocket READY ===");

            // Attach all event listeners now so they're ready for when media connects

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

            // If human was already confirmed while we were connecting, swap now
            if (humanConfirmed && call) {
              log("=== PRE-CONNECT: Human already confirmed, swapping media NOW ===");
              VoxEngine.sendMediaBetween(call, conversationalAIClient);
              log("=== STAGE 2: Full agent connected and listening ===");
            }
          })
          .catch(function (err) {
            log("=== PRE-CONNECT FAILED: " + String(err) + " ===");
            // Not fatal — if human is confirmed later, we'll try again
          });
      }

      // ================================================================
      // ACTIVATE Stage 2: Swap media from detector to pre-connected agent
      // ================================================================
      function activateFullAgent() {
        log("=== STAGE 2: Activating full agent ===");

        if (fullAgentReady && conversationalAIClient) {
          // Agent is already connected — just swap media instantly
          VoxEngine.sendMediaBetween(call, conversationalAIClient);
          log("=== STAGE 2: Full agent connected and listening (instant swap) ===");
        } else {
          // Agent still connecting — it will auto-swap when ready (see preConnectFullAgent)
          log("=== STAGE 2: Waiting for full agent to finish connecting... ===");
        }
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
        cleanupMainAgent();
        setTimeout(terminateScenario, 2000);
      });

      call.addEventListener(CallEvents.Disconnected, function () {
        log("=== CALL_DISCONNECTED ===");
        if (!transferred) {
          hangupAll();
        }
      });

      // ================================================================
      // 2) Audio starts -> Start BOTH detector AND pre-connect full agent
      //    Detector listens for human vs voicemail.
      //    Full agent connects in background (no media yet).
      //    If human confirmed -> close detector -> swap media to full agent.
      // ================================================================
      call.addEventListener(CallEvents.AudioStarted, async function () {
        log("=== AUDIO_STARTED — STAGE 1: Starting detector + pre-connecting full agent ===");
        callStartTime = Date.now();
        resetSilenceTimer(log);

        // Pre-connect full agent in background (no await — runs in parallel)
        preConnectFullAgent();

        try {
          var detectorAgentId = pickDetectorAgentId(AGENT_TYPE);
          if (!ELEVENLABS_API_KEY || !detectorAgentId) {
            log("ERROR: Missing ElevenLabs config");
            hangupAll();
            return;
          }

          // Stage 1: Tiny detector with minimal prompt (separate agent with only detector tools)
          detectorClient = await ElevenLabs.createConversationalAIClient({
            xiApiKey: ELEVENLABS_API_KEY,
            agentId: detectorAgentId,
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

                  // Close detector, activate pre-connected full agent
                  cleanupDetector();
                  activateFullAgent();
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
