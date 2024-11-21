import process from 'node:process';

import { config } from '@dotenvx/dotenvx';
import { StringOutputParser } from '@langchain/core/output_parsers';
import {
  ChatPromptTemplate,
  HumanMessagePromptTemplate,
} from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { ChatOpenAI } from '@langchain/openai';
import { defineCommand, runMain } from 'citty';
import { consola } from 'consola';

import { PangeaAiGuardRunnable } from './runnables/ai-guard.js';
import {
  MaliciousPromptError,
  PangeaPromptGuard,
} from './runnables/prompt-guard.js';

config({ override: true, quiet: true });

const main = defineCommand({
  args: {
    prompt: { type: 'positional' },
    model: {
      type: 'string',
      default: 'gpt-4o-mini',
      description: 'OpenAI model.',
    },
  },
  async run({ args }) {
    const aiGuardToken = process.env.PANGEA_AI_GUARD_TOKEN;
    if (!aiGuardToken) {
      consola.warn('PANGEA_AI_GUARD_TOKEN is not set.');
      return;
    }

    const promptGuardToken = process.env.PANGEA_PROMPT_GUARD_TOKEN;
    if (!promptGuardToken) {
      consola.warn('PANGEA_PROMPT_GUARD_TOKEN is not set.');
      return;
    }

    const pangeaDomain = process.env.PANGEA_DOMAIN || 'aws.us.pangea.cloud';

    const prompt = ChatPromptTemplate.fromMessages([
      HumanMessagePromptTemplate.fromTemplate('{input}'),
    ]);
    const model = new ChatOpenAI({ model: args.model });
    const chain = RunnableSequence.from([
      prompt,
      new PangeaAiGuardRunnable(aiGuardToken, pangeaDomain),
      new PangeaPromptGuard(promptGuardToken, pangeaDomain),
      model,
      new StringOutputParser(),
    ]);

    try {
      consola.log(await chain.invoke({ input: args.prompt }));
    } catch (error) {
      if (error instanceof MaliciousPromptError) {
        consola.error(
          `The prompt was detected as malicious (detector: ${error.detector}).`
        );
      } else {
        throw error;
      }
    }
  },
});

runMain(main);
