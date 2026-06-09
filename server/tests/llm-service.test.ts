import llmService from '../src/services/llm-service';

jest.mock('openai', () => {
  const mOpenAI = {
    chat: {
      completions: {
        create: jest.fn(),
      },
    },
  };
  return { 
    OpenAI: jest.fn(() => mOpenAI),
    AzureOpenAI: jest.fn(() => mOpenAI)
  };
});

const { OpenAI, AzureOpenAI } = require('openai');

describe('LLM Service - Comprehensive Test Suite', () => {
  let strapiMock: any;
  let service: any;
  let mockCreate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Strapi global context
    strapiMock = {
      log: { error: console.error, warn: jest.fn(), info: jest.fn() },
      config: { environment: 'test' },
      store: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({
          systemPrompt: 'Test system prompt',
          temperature: 0.1,
        }),
      }),
      service: jest.fn().mockReturnValue({
        generateUIDField: jest.fn().mockResolvedValue('test-slug'),
      }),
    };
    
    (global as any).strapi = strapiMock;

    mockCreate = new OpenAI().chat.completions.create;
    mockCreate.mockClear();

    service = llmService({ strapi: strapiMock });
  });

  describe('1. Unit Testing & Integration', () => {
    it('should successfully translate standard string fields', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '{"title": "Gato"}' } }],
      });

      const contentType = {
        uid: 'api::article.article',
        attributes: { title: { type: 'string', pluginOptions: { i18n: { localized: true } } } },
      };
      const fields = { title: 'Cat' };
      const config = { targetLanguage: 'Spanish' };

      const result = await service.generateWithLLM(contentType, fields, {}, config);

      expect(result.meta.ok).toBe(true);
      expect(result.data.title).toBe('Gato');
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. Fault Injection Tests', () => {
    it('should gracefully handle LLM returning malformed JSON (Missing Braces)', async () => {
      // Simulate fault: LLM forgets closing brace
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '{"title": "Gato"' } }], // Fault injected
      });

      const contentType = {
        uid: 'api::article.article',
        attributes: { title: { type: 'string', pluginOptions: { i18n: { localized: true } } } },
      };

      const result = await service.generateWithLLM(
        contentType,
        { title: 'Cat' },
        {},
        { targetLanguage: 'Spanish' }
      );

      // The brace-balancing utility should recover this automatically
      expect(result.meta.ok).toBe(true);
      expect(result.data.title).toBe('Gato');
    });

    it('should trigger JSON correction fallback on severe malformed output', async () => {
      // 1st request: Complete garbage
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'Oops, I failed! title: Gato' } }],
      });
      // 2nd request: Fallback correction succeeds
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '{"title": "Gato"}' } }],
      });

      const contentType = {
        uid: 'api::article.article',
        attributes: { title: { type: 'string', pluginOptions: { i18n: { localized: true } } } },
      };

      const result = await service.generateWithLLM(
        contentType,
        { title: 'Cat' },
        {},
        { targetLanguage: 'Spanish' }
      );

      expect(mockCreate).toHaveBeenCalledTimes(2); // Initial + Correction
      expect(result.meta.ok).toBe(true);
      expect(result.data.title).toBe('Gato');
    });

    it('should handle OpenAI API errors gracefully', async () => {
      // Inject API failure (e.g., 500 error or rate limit)
      mockCreate.mockRejectedValueOnce(new Error('Rate limit exceeded (429)'));

      const contentType = {
        uid: 'api::article.article',
        attributes: { title: { type: 'string' } },
      };

      const result = await service.generateWithLLM(
        contentType,
        { title: 'Cat' },
        {},
        { targetLanguage: 'Spanish' }
      );

      // Service should catch the error and return the original data gracefully
      expect(result.meta.ok).toBe(false);
      expect(result.meta.status).toBe(500);
      expect(result.meta.message).toContain('Rate limit exceeded');
      expect(result.data.title).toBe('Cat'); // Original data returned
    });
  });

  describe('3. Regression Testing (Complex Structures)', () => {
    it('should correctly traverse and merge deeply nested Dynamic Zones and Components', async () => {
      // Complex Strapi data payload
      const complexFields = {
        id: 1,
        title: 'Original Title',
        untranslatedField: 'Do not touch',
        contentBlocks: [
          {
            __component: 'blocks.text',
            id: 1,
            body: 'Hello World',
          },
          {
            __component: 'blocks.slider',
            id: 2,
            slides: [
              { id: 1, caption: 'Slide 1' },
              { id: 2, caption: 'Slide 2' },
            ],
          },
        ],
      };

      const contentType = {
        uid: 'api::page.page',
        attributes: {
          title: { type: 'string', pluginOptions: { i18n: { localized: true } } },
          untranslatedField: { type: 'string', pluginOptions: { i18n: { localized: false } } }, // Should not be translated
          contentBlocks: { type: 'dynamiczone' },
        },
      };

      const components = {
        'blocks.text': { attributes: { body: { type: 'text' } } },
        'blocks.slider': {
          attributes: { slides: { type: 'component', repeatable: true, component: 'shared.slide' } },
        },
        'shared.slide': { attributes: { caption: { type: 'string' } } },
      };

      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: 'Título Original',
                contentBlocks: {
                  '0': { body: 'Hola Mundo' },
                  '1': { slides: { '0': { caption: 'Diapositiva 1' }, '1': { caption: 'Diapositiva 2' } } },
                },
              }),
            },
          },
        ],
      });

      const result = await service.generateWithLLM(contentType, complexFields, components, {
        targetLanguage: 'Spanish',
      });

      expect(result.meta.ok).toBe(true);
      expect(result.data.title).toBe('Título Original'); // Translated
      expect(result.data.untranslatedField).toBe('Do not touch'); // Untouched
      expect(result.data.contentBlocks[0].body).toBe('Hola Mundo'); // Dynamic Zone Translated
      expect(result.data.contentBlocks[1].slides[0].caption).toBe('Diapositiva 1'); // Nested Component Translated
      expect(result.data.contentBlocks[1].slides[1].caption).toBe('Diapositiva 2');
    });
  });

  describe('4. Provider Configuration Simulation', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = process.env;
      OpenAI.mockClear();
      AzureOpenAI.mockClear();
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should initialize Azure OpenAI client when AZURE_API_VERSION is present', () => {
      process.env = {
        ...originalEnv,
        STRAPI_ADMIN_LLM_TRANSLATOR_AZURE_API_VERSION: '2023-05-15',
        STRAPI_ADMIN_LLM_TRANSLATOR_LLM_BASE_URL: 'https://my-azure.openai.azure.com/',
        LLM_TRANSLATOR_LLM_API_KEY: 'azure-key',
      };

      jest.isolateModules(() => {
        require('../src/services/llm-service');
      });

      expect(AzureOpenAI).toHaveBeenCalledWith({
        apiVersion: '2023-05-15',
        baseURL: 'https://my-azure.openai.azure.com/',
        apiKey: 'azure-key',
      });
    });

    it('should initialize standard OpenAI client for Gemini (via proxy)', () => {
      process.env = {
        ...originalEnv,
        STRAPI_ADMIN_LLM_TRANSLATOR_LLM_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        LLM_TRANSLATOR_LLM_API_KEY: 'gemini-key',
        STRAPI_ADMIN_LLM_TRANSLATOR_AZURE_API_VERSION: '', // Ensure azure is off
      };

      jest.isolateModules(() => {
        require('../src/services/llm-service');
      });

      expect(OpenAI).toHaveBeenCalledWith({
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        apiKey: 'gemini-key',
      });
    });

    it('should initialize standard OpenAI client for Groq', () => {
      process.env = {
        ...originalEnv,
        STRAPI_ADMIN_LLM_TRANSLATOR_LLM_BASE_URL: 'https://api.groq.com/openai/v1',
        LLM_TRANSLATOR_LLM_API_KEY: 'groq-key',
        STRAPI_ADMIN_LLM_TRANSLATOR_AZURE_API_VERSION: '', // Ensure azure is off
      };

      jest.isolateModules(() => {
        require('../src/services/llm-service');
      });

      expect(OpenAI).toHaveBeenCalledWith({
        baseURL: 'https://api.groq.com/openai/v1',
        apiKey: 'groq-key',
      });
    });
  });
});
