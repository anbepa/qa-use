
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
console.log(`Testing API Key: ${apiKey ? apiKey.substring(0, 10) + '...' : 'Not Found'}`);

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' }, { apiVersion: 'v1beta' });

async function run() {
  try {
    const result = await model.generateContent('Hello');
    console.log('Success:', result.response.text());
  } catch (error) {
    console.error('Error:', error);
  }
}

run();
