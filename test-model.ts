import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

async function testModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Error: GEMINI_API_KEY is not set in environment variables.');
    process.exit(1);
  }

  const modelName = 'gemini-3-flash-preview';
  console.log(`Testing model: ${modelName}`);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: 'v1beta' });

    const prompt = 'Hello, are you functioning correctly? Please reply with "Yes, I am functional." and your model version if you know it.';
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    console.log('--- Response from Gemini ---');
    console.log(text);
    console.log('-----------------------------');
    console.log('Test passed successfully.');
  } catch (error: any) {
    console.error('--- Test Failed ---');
    console.error(`Error testing model ${modelName}:`, error.message);
    if (error.message.includes('404') || error.message.includes('not found')) {
      console.error('This likely means the model name "gemini-2.5-flash" is incorrect or not available to your API key.');
    }
  }
}

testModel();
