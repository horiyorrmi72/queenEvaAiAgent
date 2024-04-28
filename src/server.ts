import express, { Request, Response } from "express";
import { RawData, WebSocket } from "ws";
import { createServer, Server as HTTPServer } from "http";
import cors from "cors";
import expressWs from "express-ws";
import { TwilioClient } from "./twilio_api";
import { Retell } from "retell-sdk";
import { CallResponse, RegisterCallResponse } from "retell-sdk/resources/call";
import { CustomLlmRequest, CustomLlmResponse } from "./types";
// import { FunctionCallingLlmClient } from "./llms/llm_azure_openai_func_call_end_call";
import { FunctionCallingLlmClient } from "./llms/llm_azure_openai_func_call";
import { DemoLlmClient } from "./llms/llm_azure_openai";

export class Server {
  private httpServer: HTTPServer;
  public app: expressWs.Application;
  private retellClient: Retell;
  private twilioClient: TwilioClient;

  constructor() {
    this.app = expressWs(express()).app;
    this.httpServer = createServer(this.app);
    this.app.use(express.json());
    this.app.use(cors());
    this.app.use(express.urlencoded({ extended: true }));

    this.handleRetellLlmWebSocket();
    this.handleRegisterCallAPI();
    this.makeOutboundCalls();


    this.retellClient = new Retell({
      apiKey: process.env.RETELL_API_KEY,
    });
    this.twilioClient = new TwilioClient(this.retellClient);
    this.twilioClient.ListenTwilioVoiceWebhook(this.app);
  }

  listen(port: number): void {
    this.app.listen(port);
    console.log("Listening on " + port);
  }

  // Only used for web frontend to register call so that frontend don't need api key
  handleRegisterCallAPI() {
    this.app.post(
      "/register-call-on-your-server",
      async (req: Request, res: Response) => {
        // Extract agentId from request body; apiKey should be securely stored and not passed from the client
        const { agent_id } = req.body;

        try {
          const callResponse: RegisterCallResponse =
            await this.retellClient.call.register({
              agent_id: agent_id,
              audio_websocket_protocol: "web",
              audio_encoding: "s16le",
              sample_rate: 24000,
            });
          // Send back the successful response to the client
          res.json(callResponse);
        } catch (error) {
          console.error("Error registering call:", error);
          // Send an error response back to the client
          res.status(500).json({ error: "Failed to register call" });
        }
      }
    );
  }

  handleRetellLlmWebSocket() {
    this.app.ws(
      "/llm-websocket/:call_id",
      async (ws: WebSocket, req: Request) => {
        try {
          const callId = req.params.call_id;
          console.log("Handle llm ws for: ", callId);

          const timeoutId = setTimeout(() => {
            if (ws) ws.close(1002, "Timeout after 60 seconds");
          }, 1000 * 60);

          // Send config to Retell server
          const config: CustomLlmResponse = {
            response_type: "config",
            config: {
              auto_reconnect: true,
              call_details: true,
            },
          };
          ws.send(JSON.stringify(config));

          // Start sending the begin message to signal the client is ready.
          const llmClient = new FunctionCallingLlmClient();
          llmClient.BeginMessage(ws);

          ws.on("error", (err) => {
            console.error("Error received in LLM websocket client: ", err);
          });
          ws.on("close", (err) => {
            clearTimeout(timeoutId);
            console.error("Closing llm ws for: ", callId);
          });

          ws.on("message", async (data: RawData, isBinary: boolean) => {
            if (isBinary) {
              console.error("Got binary message instead of text in websocket.");
              ws.close(1002, "Cannot find corresponding Retell LLM.");
            }
            const request: CustomLlmRequest = JSON.parse(data.toString());

            // There are 5 types of interaction_type: call_details, pingpong, update_only, response_required, and reminder_required.
            // Not all of them need to be handled, only response_required and reminder_required.
            if (request.interaction_type === "ping_pong") {
              let pingpongResponse: CustomLlmResponse = {
                response_type: "ping_pong",
                timestamp: request.timestamp,
              };
              ws.send(JSON.stringify(pingpongResponse));
            } else if (request.interaction_type === "call_details") {
              console.log("call details: ", request.call);
              // print call detailes
            } else if (request.interaction_type === "update_only") {
              // process live transcript update if needed
            } else if (
              request.interaction_type === "reminder_required" ||
              request.interaction_type === "response_required"
            ) {
              console.clear();
              console.log("req", request);
              llmClient.DraftResponse(request, ws);
            }
          });
        } catch (err) {
          console.error("Encountered erorr:", err);
          ws.close(1005, "Encountered erorr: " + err);
        }
      }
    );
  }

  makeOutboundCalls() {
    this.app.post('/make-outbound-call', async (req: Request, res: Response) => {
      const { to } = req.body;
      try {
        if (!(to)) {
          return res.status(400).json({ msg: "called party can not be empty!" });
        }
        const calls = await this.retellClient.call.create({
          from_number: process.env.PHONE_NUMBER,
          to_number: to,
          override_agent_id: process.env.agentId
        });
        return res.status(201).json({ msg: "call initiated successfully!", calls })

      }
      catch (error) {
        console.log('Error making outbound call:', error);
        return res.status(500).json({ msg: "err making call", error })
      }
    });
  }

}
