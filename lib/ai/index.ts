/**
 * AI Module - Main Export
 * Multi-Model Architecture entry point
 */

// Types
export * from './types';

// Registry
export * from './registry';

// Normalizer
export * from './normalizer';

// Factory
export * from './factory';

// Adapters (for direct access if needed)
export { GeminiAdapter, geminiAdapter } from './adapters/gemini';
export { OpenAIAdapter, providerKeyManager, createDeepSeekAdapter, createMinimaxAdapter, createOpenAIAdapter } from './adapters/openai';
export { BaseAdapter } from './adapters/base';
