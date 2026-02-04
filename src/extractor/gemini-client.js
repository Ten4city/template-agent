/**
 * Gemini Client
 *
 * Unified client that routes to SDK or REST API based on model:
 * - gemini-3-* models → REST API with global endpoint
 * - Other models → VertexAI SDK with us-central1
 */

import { VertexAI } from '@google-cloud/vertexai';
import { GoogleAuth } from 'google-auth-library';
import fs from 'fs';

// Service account: from GOOGLE_CREDENTIALS env var (JSON string) or file path
const SERVICE_ACCOUNT_PATH = process.env.SERVICE_ACCOUNT_PATH || './service-account.json';

// Cache for clients
let sdkClient = null;
let restAuth = null;
let serviceAccount = null;

/**
 * Get service account data
 */
function getServiceAccount() {
  if (!serviceAccount) {
    // First try environment variable (for cloud deployments)
    if (process.env.GOOGLE_CREDENTIALS) {
      serviceAccount = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    } else {
      // Fall back to file (for local development)
      serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'));
    }
  }
  return serviceAccount;
}

/**
 * Create SDK-based client for Gemini 2.x models
 */
function getSDKClient() {
  if (!sdkClient) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = SERVICE_ACCOUNT_PATH;
    const sa = getServiceAccount();
    sdkClient = new VertexAI({
      project: sa.project_id,
      location: 'us-central1',
    });
  }
  return sdkClient;
}

/**
 * Get REST auth client for Gemini 3.x models
 */
async function getRESTAuth() {
  if (!restAuth) {
    restAuth = new GoogleAuth({
      keyFile: SERVICE_ACCOUNT_PATH,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  }
  return restAuth;
}

/**
 * Check if model requires REST API (Gemini 3 models)
 */
function isGemini3Model(model) {
  return model.startsWith('gemini-3');
}

/**
 * Create a generative model instance
 *
 * @param {string} model - Model name (e.g., 'gemini-2.5-pro', 'gemini-3-pro-preview')
 * @param {Object} options - Model options
 * @param {Object} options.generationConfig - Generation config
 * @param {Array} options.tools - Function declarations
 * @param {string} options.systemInstruction - System prompt
 * @returns {Object} Model with generateContent() and startChat() methods
 */
export function createGenerativeModel(model, options = {}) {
  if (isGemini3Model(model)) {
    return createRESTModel(model, options);
  }
  return createSDKModel(model, options);
}

/**
 * Create SDK-based model (Gemini 2.x)
 */
function createSDKModel(model, options) {
  const client = getSDKClient();

  const modelConfig = {
    model,
    generationConfig: options.generationConfig || {
      maxOutputTokens: 8192,
      temperature: 0.1,
    },
  };

  if (options.tools) {
    modelConfig.tools = options.tools;
  }

  if (options.systemInstruction) {
    modelConfig.systemInstruction = options.systemInstruction;
  }

  return client.getGenerativeModel(modelConfig);
}

/**
 * Create REST-based model wrapper (Gemini 3.x)
 * Returns object with same interface as SDK model
 */
function createRESTModel(model, options) {
  const sa = getServiceAccount();
  const baseUrl = `https://aiplatform.googleapis.com/v1/projects/${sa.project_id}/locations/global/publishers/google/models/${model}`;

  return {
    /**
     * Generate content (single turn)
     */
    async generateContent(contents) {
      const auth = await getRESTAuth();
      const client = await auth.getClient();
      const token = await client.getAccessToken();

      // Normalize contents to array format
      const contentsArray = Array.isArray(contents) ? contents : [{ parts: [{ text: contents }] }];

      const body = {
        contents: contentsArray,
        generationConfig: options.generationConfig || {
          maxOutputTokens: 8192,
          temperature: 0.1,
        },
      };

      if (options.systemInstruction) {
        body.systemInstruction = {
          parts: [{ text: options.systemInstruction }],
        };
      }

      if (options.tools) {
        body.tools = options.tools;
      }

      const response = await fetch(`${baseUrl}:generateContent`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return { response: data };
    },

    /**
     * Start a chat session
     */
    startChat(chatOptions = {}) {
      const history = chatOptions.history || [];

      return {
        history,

        /**
         * Send message in chat
         */
        async sendMessage(contents) {
          const auth = await getRESTAuth();
          const client = await auth.getClient();
          const token = await client.getAccessToken();

          // Normalize message contents
          let messageParts;
          if (Array.isArray(contents)) {
            messageParts = contents;
          } else if (typeof contents === 'string') {
            messageParts = [{ text: contents }];
          } else {
            messageParts = [contents];
          }

          // Detect if this is a function response
          const isFunctionResponse = Array.isArray(contents) &&
            contents.some(c => c.functionResponse);

          // Add message to history with appropriate role
          this.history.push({
            role: isFunctionResponse ? 'function' : 'user',
            parts: messageParts,
          });

          const body = {
            contents: this.history,
            generationConfig: options.generationConfig || {
              maxOutputTokens: 8192,
              temperature: 0.1,
            },
          };

          if (options.systemInstruction) {
            body.systemInstruction = {
              parts: [{ text: options.systemInstruction }],
            };
          }

          if (options.tools) {
            body.tools = options.tools;
          }

          const response = await fetch(`${baseUrl}:generateContent`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token.token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
          }

          const data = await response.json();

          // Add model response to history
          if (data.candidates && data.candidates[0]) {
            this.history.push(data.candidates[0].content);
          }

          return { response: data };
        },
      };
    },
  };
}

/**
 * Convert tool definitions to Gemini function declarations
 */
export function convertToolsToGemini(tools) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema,
  }));
}
