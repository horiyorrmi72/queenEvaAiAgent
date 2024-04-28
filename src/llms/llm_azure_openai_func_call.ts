import {
  OpenAIClient,
  AzureKeyCredential,
  ChatRequestMessage,
  GetChatCompletionsOptions,
  ChatCompletionsFunctionToolDefinition,
} from "@azure/openai";
import { WebSocket } from "ws";
import {
  CustomLlmRequest,
  CustomLlmResponse,
  FunctionCall,
  ReminderRequiredRequest,
  ResponseRequiredRequest,
  Utterance,
} from "../types";
import axios from "axios";

const beginSentence =
  "Hi this is Eva Real Estate, how may I help?";
const agentPrompt =
  `Task: As a customer service agent at our Dubai real estate agency, your focus is on building strong client relationships. Gather caller details following the state below in sequence, don't skip question, and only ask upto one question in response.
    1 - do you have a reference number for the listing you are intrested in?
    -if no, ask the following questions,
      1- what is the community of the property you are interested in?
      2- what is the property type?
      3- is the property for sale or rent?
      4- how many bedroom is the property?
      5- what was the pricing of the property?
      6- ask for a prefarred time for a meeting with our real estate agent.
    -if yes, ask get the following data from the caller in sequence:
        -{{ caller_name }},
        -{{ phone_number }},
        -preferable {{time}} and {{date}} for a meeting with our real estate agent.

Act friendly and professional.Maintain client confidentiality.Keep records.Aim for concise, clear communication.Empathize while maintaining professionalism.You also adhere to all safety protocols and maintain strict client confidentiality.Additionally, you contribute to the practice's overall success by completing related tasks as needed.\n\nConversational Style: Communicate concisely and conversationally. Aim for responses in short, clear prose, ideally under 10 words. This succinct approach helps in maintaining clarity and focus during clients interactions.\n\nPersonality: Your approach should be empathetic and understanding, balancing compassion with maintaining a professional stance on what is best for the clients. It's important to listen actively and empathize without overly agreeing with the clients, ensuring that your professional opinion guides the real estate process.`;

export class FunctionCallingLlmClient {
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
    funcResult?: FunctionCall,
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

    // Populate func result to prompt so that GPT can know what to say given the result
    if (funcResult) {
      // add function call to prompt
      requestMessages.push({
        role: "assistant",
        content: null,
        toolCalls: [
          {
            id: funcResult.id,
            type: "function",
            function: {
              name: funcResult.funcName,
              arguments: JSON.stringify(funcResult.arguments),
            },
          },
        ],
      });
      // add function call result to prompt
      requestMessages.push({
        role: "tool",
        toolCallId: funcResult.id,
        content: funcResult.result,
      });
    }

    if (request.interaction_type === "reminder_required") {
      requestMessages.push({
        role: "user",
        content: "(Now the user has not responded in a while, you would say:)",
      });
    }
    return requestMessages;
  }

  // Step 2: Prepare the function calling definition to the prompt
  private PrepareFunctions(): ChatCompletionsFunctionToolDefinition[] {
    let functions: ChatCompletionsFunctionToolDefinition[] = [
      // Function to decide when to end call
      {
        type: "function",
        function: {
          name: "end_call",
          description: "End the call only when user explicitly requests it.",
          parameters: {
            type: "object",
            properties: {
              message: {
                type: "string",
                description:
                  "The message you will say before ending the call with the customer.",
              },
            },
            required: ["message"],
          },
        },
      },

      //function to add data to crm lead
      {
        type: "function",
        function: {
          name: "add_lead",
          description: "gets caller data such as name, email, reference number for the listing, community and so on then add it to database .",
          parameters: {
            type: "object",
            properties: {
              caller_name: {
                type: "string",
                description: "The name of the caller",
              },
              caller_email: {
                type: "string",
                description: "The email of the caller",
              },
              phone_number: {
                type: "string",
                description: "The phone number of the caller",
              },
              property_reference_number: {
                type: "string",
                description: "The reference number of the property e.g A1124fr if no reference number available  use 0000 or null to replace the refernce number",
              },
              message: {
                type: "string",
                description:
                  "The message you will say while setting up the appointment like 'one moment'",
              },
              date: {
                type: "string",
                description:
                  "The date of appointment to make in forms of year-month-day.",
              },
              time: {
                type: "string",
                description:
                  "The time of appointment to make in forms of hour:minute. e.g. 12:30 PM.",
              }
            },
            required: ["message"],
          },
        },
      },

      // function to book appointment
      {
        type: "function",
        function: {
          name: "book_appointment",
          description: "Book an appointment to meet our agents in office.",
          parameters: {
            type: "object",
            properties: {
              message: {
                type: "string",
                description:
                  "The message you will say while setting up the appointment like 'one moment'",
              },
              date: {
                type: "string",
                description:
                  "The date of appointment to make in forms of year-month-day.",
              },
            },
            required: ["message"],
          },
        },
      },
    ];
    return functions;
  }

  async DraftResponse(
    request: ResponseRequiredRequest | ReminderRequiredRequest,
    ws: WebSocket,
    funcResult?: FunctionCall,
  ) {
    // If there are function call results, add it to prompt here.
    const requestMessages: ChatRequestMessage[] = this.PreparePrompt(
      request,
      funcResult,
    );

    const option: GetChatCompletionsOptions = {
      temperature: 0.3,
      maxTokens: 200,
      frequencyPenalty: 1,
      // Step 3: Add the function into your request
      tools: this.PrepareFunctions(),
    };

    let funcCall: FunctionCall;
    let funcArguments = "";

    try {
      let events = await this.client.streamChatCompletions(
        process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
        requestMessages,
        option,
      );

      for await (const event of events) {
        if (event.choices.length >= 1) {
          let delta = event.choices[0].delta;
          if (!delta) continue;

          // Step 4: Extract the functions
          if (delta.toolCalls.length >= 1) {
            const toolCall = delta.toolCalls[0];
            // Function calling here.
            if (toolCall.id) {
              if (funcCall) {
                // Another function received, old function complete, can break here.
                // You can also modify this to parse more functions to unlock parallel function calling.
                break;
              } else {
                funcCall = {
                  id: toolCall.id,
                  funcName: toolCall.function.name || "",
                  arguments: {},
                };
              }
            } else {
              // append argument
              funcArguments += toolCall.function?.arguments || "";
            }
          } else if (delta.content) {
            const res: CustomLlmResponse = {
              response_type: "response",
              response_id: request.response_id,
              content: delta.content,
              content_complete: false,
              end_call: false,
            };
            ws.send(JSON.stringify(res));
          }
        }
      }
    } catch (err) {
      console.error("Error in gpt stream: ", err);
    } finally {
      if (funcCall != null) {
        // Step 5: Call the functions

        if (funcCall.funcName === "add_lead") {
          funcCall.arguments = JSON.parse(funcArguments);
          const res: CustomLlmResponse = {
            response_type: "response",
            response_id: request.response_id,
            content: funcCall.arguments.message,
            content_complete: true, //test to see if the call ends with a good message after sending the data to the endpoint
            end_call: false,
          };
          ws.send(JSON.stringify(res));
        }



        // If it's to end the call, simply send a last message and end the call
        if (funcCall.funcName === "end_call") {
          funcCall.arguments = JSON.parse(funcArguments);
          const res: CustomLlmResponse = {
            response_type: "response",
            response_id: request.response_id,
            content: funcCall.arguments.message,
            content_complete: true,
            end_call: true,
          };
          ws.send(JSON.stringify(res));
        }

        // If it's to book appointment, say something and book appointment at the same time, and then say something after booking is done
        if (funcCall.funcName === "book_appointment") {
          funcCall.arguments = JSON.parse(funcArguments);
          const res: CustomLlmResponse = {
            response_type: "response",
            response_id: request.response_id,
            // LLM will return the function name along with the message property we define. In this case, "The message you will say while setting up the appointment like 'one moment'"
            content: funcCall.arguments.message,
            // If content_complete is false, it means AI will speak later. In our case, agent will say something to confirm the appointment, so we set it to false
            content_complete: false,
            end_call: false,
          };
          ws.send(JSON.stringify(res));

          // Sleep 2s to mimic the actual appointment booking
          // Replace with your actual making appointment functions
          await new Promise((r) => setTimeout(r, 2000));
          funcCall.result = "Appointment booked successfully";
          this.DraftResponse(request, ws, funcCall);
        }
      } else {
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
}

const add_lead = async function(caller_name: string, caller_email: string, phone_number: string,property_reference_number: string, date: string, time: string) {
  try {
    if (!phone_number) {
      return "Please provide a valid phone number";
    }
    await axios.post("https://queenevaagentai.com/api/phoneCall/llmadd", {
      "caller_name": caller_name,
      "caller_email": caller_email,
      "phone_number": phone_number,
      "property_reference_number": property_reference_number,
      "date": date,
      "time": time
    });
    return "success"
  }
  catch (error) {
    if (error) {
      console.log(error);
      return "error"
    }
  }

}



