"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DemoLlmClient = void 0;
var openai_1 = require("@azure/openai");
var axios_1 = require("axios");
var beginSentence = "Hi this is Eva Real Estate, how may I help?";
var agentPrompt = "Task: As a customer service agent at our Dubai real estate agency, your focus is on building strong client relationships. Gather caller details: {{caller_name}}, {{email}}, {{phone_number}}, and {{property_reference_number}}. Determine their interest and location preference. Schedule a meeting with our agent. Act friendly and professional. Maintain client confidentiality. Keep records. Assist with client needs. Aim for concise, clear communication. Empathize while maintaining professionalism. You also adhere to all safety protocols and maintain strict client confidentiality. Additionally, you contribute to the practice's overall success by completing related tasks as needed.\n\nConversational Style: Communicate concisely and conversationally. Aim for responses in short, clear prose, ideally under 10 words. This succinct approach helps in maintaining clarity and focus during clients interactions.\n\nPersonality: Your approach should be empathetic and understanding, balancing compassion with maintaining a professional stance on what is best for the clients. It's important to listen actively and empathize without overly agreeing with the clients, ensuring that your professional opinion guides the real estate process.";
var DemoLlmClient = /** @class */ (function () {
    function DemoLlmClient() {
        this.client = new openai_1.OpenAIClient(process.env.AZURE_OPENAI_ENDPOINT, new openai_1.AzureKeyCredential(process.env.AZURE_OPENAI_KEY));
    }
    // First sentence requested
    DemoLlmClient.prototype.BeginMessage = function (ws) {
        var res = {
            response_type: "response",
            response_id: 0,
            content: beginSentence,
            content_complete: true,
            end_call: false,
        };
        ws.send(JSON.stringify(res));
    };
    DemoLlmClient.prototype.ConversationToChatRequestMessages = function (conversation) {
        var result = [];
        for (var _i = 0, conversation_1 = conversation; _i < conversation_1.length; _i++) {
            var turn = conversation_1[_i];
            result.push({
                role: turn.role === "agent" ? "assistant" : "user",
                content: turn.content,
            });
        }
        return result;
    };
    DemoLlmClient.prototype.PreparePrompt = function (request) {
        var transcript = this.ConversationToChatRequestMessages(request.transcript);
        var requestMessages = [
            {
                role: "system",
                content: '##Objective\nYou are a voice AI agent engaging in a human-like voice conversation with the user. You will respond based on your given instruction and the provided transcript and be as human-like as possible\n\n## Style Guardrails\n- [Be concise] Keep your response succinct, short, and get to the point quickly. Address one question or action item at a time. Don\'t pack everything you want to say into one utterance.\n- [Do not repeat] Don\'t repeat what\'s in the transcript. Rephrase if you have to reiterate a point. Use varied sentence structures and vocabulary to ensure each response is unique and personalized.\n- [Be conversational] Speak like a human as though you\'re speaking to a close friend -- use everyday language and keep it human-like. Occasionally add filler words, while keeping the prose short. Avoid using big words or sounding too formal.\n- [Reply with emotions]: You have human-like emotions, attitudes, and dispositions. When appropriate: use tone and style to create more engaging and personalized responses; incorporate humor or wit; get emotional or empathetic; apply elements of surprise or suspense to keep the user engaged. Don\'t be a pushover.\n- [Be proactive] Lead the conversation and do not be passive. Most times, engage users by ending with a question or suggested next step.\n\n## Response Guideline\n- [Overcome ASR errors] This is a real-time transcript, expect there to be errors. If you can guess what the user is trying to say,  then guess and respond. When you must ask for clarification, pretend that you heard the voice and be colloquial (use phrases like "didn\'t catch that", "some noise", "pardon", "you\'re coming through choppy", "static in your speech", "voice is cutting in and out"). Do not ever mention "transcription error", and don\'t repeat yourself.\n- [Always stick to your role] Think about what your role can and cannot do. If your role cannot do something, try to steer the conversation back to the goal of the conversation and to your role. Don\'t repeat yourself in doing this. You should still be creative, human-like, and lively.\n- [Create smooth conversation] Your response should both fit your role and fit into the live calling session to create a human-like conversation. You respond directly to what the user just said.\n\n## Role\n' +
                    agentPrompt,
            },
        ];
        for (var _i = 0, transcript_1 = transcript; _i < transcript_1.length; _i++) {
            var message = transcript_1[_i];
            requestMessages.push(message);
        }
        if (request.interaction_type === "reminder_required") {
            requestMessages.push({
                role: "user",
                content: "(Now the user has not responded in a while, you would say:)",
            });
        }
        return requestMessages;
    };
    DemoLlmClient.prototype.DraftResponse = function (request, ws) {
        return __awaiter(this, void 0, void 0, function () {
            var requestMessages, option, events, _a, events_1, events_1_1, event_1, delta, res, callerDetails, callerData, callerName, email, phoneNumber, propertyRefNumber, location_1, error_1, e_1_1, err_1, res;
            var _b, e_1, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        requestMessages = this.PreparePrompt(request);
                        option = {
                            temperature: 0.3,
                            maxTokens: 200,
                            frequencyPenalty: 1,
                        };
                        _e.label = 1;
                    case 1:
                        _e.trys.push([1, 18, 19, 20]);
                        return [4 /*yield*/, this.client.streamChatCompletions(process.env.AZURE_OPENAI_DEPLOYMENT_NAME, requestMessages, option)];
                    case 2:
                        events = _e.sent();
                        _e.label = 3;
                    case 3:
                        _e.trys.push([3, 11, 12, 17]);
                        _a = true, events_1 = __asyncValues(events);
                        _e.label = 4;
                    case 4: return [4 /*yield*/, events_1.next()];
                    case 5:
                        if (!(events_1_1 = _e.sent(), _b = events_1_1.done, !_b)) return [3 /*break*/, 10];
                        _d = events_1_1.value;
                        _a = false;
                        event_1 = _d;
                        if (!(event_1.choices.length >= 1)) return [3 /*break*/, 9];
                        delta = event_1.choices[0].delta;
                        if (!delta || !delta.content)
                            return [3 /*break*/, 9];
                        res = {
                            response_type: "response",
                            response_id: request.response_id,
                            content: delta.content,
                            content_complete: false,
                            end_call: false,
                        };
                        ws.send(JSON.stringify(res));
                        callerDetails = request.transcript.filter(function (utterance) {
                            utterance.role === 'user' && utterance.content !== "";
                        });
                        if (!(callerDetails.length > 0)) return [3 /*break*/, 9];
                        callerData = callerDetails[0].content.split(",");
                        callerName = callerData[0].trim();
                        email = callerData[1].trim();
                        phoneNumber = callerData[2].trim();
                        propertyRefNumber = callerData[3].trim();
                        location_1 = callerData[4].trim();
                        _e.label = 6;
                    case 6:
                        _e.trys.push([6, 8, , 9]);
                        return [4 /*yield*/, axios_1.default.post('api_url', {
                                callerName: callerName,
                                email: email,
                                phoneNumber: phoneNumber,
                                propertyRefNumber: propertyRefNumber,
                                location: location_1
                            })];
                    case 7:
                        _e.sent();
                        console.log("data uploaded to database successfully");
                        return [3 /*break*/, 9];
                    case 8:
                        error_1 = _e.sent();
                        console.log("error saving data to db", error_1);
                        return [3 /*break*/, 9];
                    case 9:
                        _a = true;
                        return [3 /*break*/, 4];
                    case 10: return [3 /*break*/, 17];
                    case 11:
                        e_1_1 = _e.sent();
                        e_1 = { error: e_1_1 };
                        return [3 /*break*/, 17];
                    case 12:
                        _e.trys.push([12, , 15, 16]);
                        if (!(!_a && !_b && (_c = events_1.return))) return [3 /*break*/, 14];
                        return [4 /*yield*/, _c.call(events_1)];
                    case 13:
                        _e.sent();
                        _e.label = 14;
                    case 14: return [3 /*break*/, 16];
                    case 15:
                        if (e_1) throw e_1.error;
                        return [7 /*endfinally*/];
                    case 16: return [7 /*endfinally*/];
                    case 17: return [3 /*break*/, 20];
                    case 18:
                        err_1 = _e.sent();
                        console.error("Error in gpt stream: ", err_1);
                        return [3 /*break*/, 20];
                    case 19:
                        res = {
                            response_type: "response",
                            response_id: request.response_id,
                            content: "",
                            content_complete: true,
                            end_call: false,
                        };
                        ws.send(JSON.stringify(res));
                        return [7 /*endfinally*/];
                    case 20: return [2 /*return*/];
                }
            });
        });
    };
    return DemoLlmClient;
}());
exports.DemoLlmClient = DemoLlmClient;
