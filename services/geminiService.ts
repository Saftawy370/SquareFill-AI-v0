
import { GoogleGenAI } from "@google/genai";

export const processImageToSquare = async (base64Data: string, mimeType: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  
  // Clean base64 string
  const base64Content = base64Data.split(',')[1] || base64Data;

  const prompt = `
    Transform this image into a 1:1 aspect ratio square. 
    STRICT REQUIREMENTS: 
    1. DO NOT SHRINK OR SCALE DOWN the elements or subjects in the original image. Keep them at their original relative size.
    2. Maintain original proportions exactly. No stretching or distortion.
    3. Center the original content and use generative outpainting to expand the background to fill the 1:1 square canvas.
    4. If the image is landscape, extend the top and bottom. If portrait, extend the left and right.
    5. The newly generated areas must match the existing background perfectly in terms of texture, lighting, and style.
    6. If the image has transparency, intelligently fill those areas to complete a solid 1:1 square image.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Content,
              mimeType: mimeType,
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1",
        }
      }
    });

    const candidate = response.candidates?.[0];
    if (!candidate) throw new Error("No response from AI");

    for (const part of candidate.content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }

    throw new Error("AI did not return an image part.");
  } catch (error: any) {
    console.error("Gemini Error:", error);
    throw new Error(error.message || "Failed to process image.");
  }
};
