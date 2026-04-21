import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface OCRResult {
  question: string;
  options?: string[];
  userAnswer?: string;
  standardAnswer?: string;
  knowledgePoint: string;
}

export interface VariantQuestion {
  question: string;
  answer: string;
  analysis: string;
}

export const geminiService = {
  async recognizeQuestion(base64Image: string): Promise<OCRResult> {
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: [
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Image.split(',')[1] || base64Image,
          },
        },
        {
          text: "识别图片中的错题。提取题目文本、选项（如果有）、用户原答案（如果有）、标准答案（如果有）。同时判断该题目的核心知识点（一个简短的短语）。请以JSON格式返回。",
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            userAnswer: { type: Type.STRING },
            standardAnswer: { type: Type.STRING },
            knowledgePoint: { type: Type.STRING },
          },
          required: ["question", "knowledgePoint"],
        },
      },
    });

    if (!response.text) {
      throw new Error("AI 未返回有效内容");
    }

    return JSON.parse(response.text);
  },

  async generateVariants(originalQuestion: string, knowledgePoint: string): Promise<VariantQuestion[]> {
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: `基于知识点“${knowledgePoint}”，针对以下原题生成3道相似的举一反三题目：
      原题：${originalQuestion}
      
      要求：
      1. 覆盖同一知识点的不同角度或变式。
      2. 难度与原题相当或略有梯度。
      3. 每道题附带正确答案。
      4. 每道题附带解析，解析需侧重易错点分析（例如：“本题常见错误是...”）。
      
      请以JSON数组格式返回。`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              answer: { type: Type.STRING },
              analysis: { type: Type.STRING },
            },
            required: ["question", "answer", "analysis"],
          },
        },
      },
    });

    if (!response.text) {
      throw new Error("AI 未返回有效内容");
    }

    return JSON.parse(response.text);
  },
};
