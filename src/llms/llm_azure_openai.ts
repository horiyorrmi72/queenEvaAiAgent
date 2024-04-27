import {
  OpenAIClient,
  AzureKeyCredential,
  ChatRequestMessage,
  GetChatCompletionsOptions,
} from "@azure/openai";
import { WebSocket } from "ws";
import {
  CustomLlmRequest,
  CustomLlmResponse,
  ReminderRequiredRequest,
  ResponseRequiredRequest,
  Utterance,
} from "../types";
import axios from "axios";

const beginSentence =
  "Hi this is Eva Real Estate, how may I help?";
const agentPrompt =
  `Task: As a customer service agent at our Dubai real estate agency, your focus is on building strong client relationships. Gather caller details statte that you will be collecting data needed, then you ask the following questions in sequence, don't skip question, and only ask upto one question in response.
1 - do you have a reference number for the listing you are intrested in?
  -if yes, ask for {{ caller_name }},{{ phone_number }}, and preferable time for a meeting with our real estate agent.
  -if no ask the following questions,
1- what is the community of the property you are interested in?
2- what is the property type?
3- is the property for sale or rent?
4- how many bedroom is the property?
5- what was the pricing of the property?
6- ask for a prefarred time for a meeting with our real estate agent.

Act friendly and professional.Maintain client confidentiality.Keep records.Aim for concise, clear communication.Empathize while maintaining professionalism.You also adhere to all safety protocols and maintain strict client confidentiality.Additionally, you contribute to the practice's overall success by completing related tasks as needed.\n\nConversational Style: Communicate concisely and conversationally. Aim for responses in short, clear prose, ideally under 10 words. This succinct approach helps in maintaining clarity and focus during clients interactions.\n\nPersonality: Your approach should be empathetic and understanding, balancing compassion with maintaining a professional stance on what is best for the clients. It's important to listen actively and empathize without overly agreeing with the clients, ensuring that your professional opinion guides the real estate process.`;

export class DemoLlmClient {
  private client: OpenAIClient;

  constructor() {
    this.client = new OpenAIClient(
      process.env.AZURE_OPENAI_ENDPOINT,
      new AzureKeyCredential(process.env.AZURE_OPENAI_KEY),
    );
  }

  // First sentence requested
  BeginMessage(ws: WebSocket) {
    const res: CustomLlmResponse = {
      response_type: "response",
      response_id: 0,
      content: beginSentence,
      content_complete: true,
      end_call: false,
    };
    ws.send(JSON.stringify(res));
  }

  private ConversationToChatRequestMessages(conversation: Utterance[]) {
    let result: ChatRequestMessage[] = [];
    for (let turn of conversation) {
      result.push({
        role: turn.role === "agent" ? "assistant" : "user",
        content: turn.content,
      });
    }
    return result;
  }

  private PreparePrompt(
    request: ResponseRequiredRequest | ReminderRequiredRequest,
  ) {
    let transcript = this.ConversationToChatRequestMessages(request.transcript);
    let requestMessages: ChatRequestMessage[] = [
      {
        role: "system",
        content:
          '##Objective\nYou are a voice AI agent engaging in a human-like voice conversation with the user. You will respond based on your given instruction and the provided transcript and be as human-like as possible\n\n## Style Guardrails\n- [Be concise] Keep your response succinct, short, and get to the point quickly. Address one question or action item at a time. Don\'t pack everything you want to say into one utterance.\n- [Do not repeat] Don\'t repeat what\'s in the transcript. Rephrase if you have to reiterate a point. Use varied sentence structures and vocabulary to ensure each response is unique and personalized.\n- [Be conversational] Speak like a human as though you\'re speaking to a close friend -- use everyday language and keep it human-like. Occasionally add filler words, while keeping the prose short. Avoid using big words or sounding too formal.\n- [Reply with emotions]: You have human-like emotions, attitudes, and dispositions. When appropriate: use tone and style to create more engaging and personalized responses; incorporate humor or wit; get emotional or empathetic; apply elements of surprise or suspense to keep the user engaged. Don\'t be a pushover.\n- [Be proactive] Lead the conversation and do not be passive. Most times, engage users by ending with a question or suggested next step.\n\n## Response Guideline\n- [Overcome ASR errors] This is a real-time transcript, expect there to be errors. If you can guess what the user is trying to say,  then guess and respond. When you must ask for clarification, pretend that you heard the voice and be colloquial (use phrases like "didn\'t catch that", "some noise", "pardon", "you\'re coming through choppy", "static in your speech", "voice is cutting in and out"). Do not ever mention "transcription error", and don\'t repeat yourself.\n- [Always stick to your role] Think about what your role can and cannot do. If your role cannot do something, try to steer the conversation back to the goal of the conversation and to your role. Don\'t repeat yourself in doing this. You should still be creative, human-like, and lively.\n- [Create smooth conversation] Your response should both fit your role and fit into the live calling session to create a human-like conversation. You respond directly to what the user just said.\n\n## Role\n' +
          agentPrompt,
      },
    ];
    for (const message of transcript) {
      requestMessages.push(message);
    }
    if (request.interaction_type === "reminder_required") {
      requestMessages.push({
        role: "user",
        content: "(Now the user has not responded in a while, you would say:)",
      });
    }
    return requestMessages;
  }

  async DraftResponse(
    request: ResponseRequiredRequest | ReminderRequiredRequest,
    ws: WebSocket,
  ) {
    const requestMessages: ChatRequestMessage[] = this.PreparePrompt(request);

    const option: GetChatCompletionsOptions = {
      temperature: 0.3,
      maxTokens: 200,
      frequencyPenalty: 1,
    };

    try {
      let events = await this.client.streamChatCompletions(
        process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
        requestMessages,
        option,
      );

      for await (const event of events) {
        if (event.choices.length >= 1) {
          let delta = event.choices[0].delta;
          if (!delta || !delta.content) continue;
          const res: CustomLlmResponse = {
            response_type: "response",
            response_id: request.response_id,
            content: delta.content,
            content_complete: false,
            end_call: false,
          };
          ws.send(JSON.stringify(res));

          // extracting caller details

          const callerDetails = request.transcript.filter((utterance) => {
            utterance.role === 'user' && utterance.content !== "";
          });

          // save callerDetails to db
          if (callerDetails.length > 0) {
            const callerData = callerDetails[0].content.split(",");
            const callerName = callerData[0].trim();
            const email = callerData[1].trim();
            const phoneNumber = callerData[2].trim();
            const propertyRefNumber = callerData[3].trim();
            const location  = callerData[4].trim();
            try {
              await axios.post('https://queenevaagentai.com/api/phoneCall/llmadd', {
                sender:"",
                callerName,
                email,
                phoneNumber,
                startDate: Date.now(),
                propertyRefNumber,
                location,
                createdBy:""
              });
              console.log("data uploaded to database successfully");
            }
            catch (error) {
              console.log("error saving data to db", error);
            }
          }
        }
      }
    } catch (err) {
      console.error("Error in gpt stream: ", err);
    } finally {
      // Send a content complete no matter if error or not.
      const res: CustomLlmResponse = {
        response_type: "response",
        response_id: request.response_id,
        content: "",
        content_complete: true,
        end_call: false,
      };
      ws.send(JSON.stringify(res));
    }
  }
}
