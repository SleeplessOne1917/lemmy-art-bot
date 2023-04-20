#!/usr/bin/env ts-node

import LemmyBot from 'lemmy-bot';
import Replicate from 'replicate';
import { config } from 'dotenv';

config();
const { INSTANCE, USERNAME_OR_EMAIL, PASSWORD, API_KEY } =
  process.env as Record<string, string>;

const replicate = new Replicate({
  auth: API_KEY,
});

const removeMention = (text: string) =>
  text.replace(
    new RegExp(
      `(\\[\\s*)?@${USERNAME_OR_EMAIL}@${INSTANCE.replace(
        /:\d+/,
        ''
      )}(\\s*\\]\\(.*\\))?`,
      'g'
    ),
    ''
  );

const generateArt = (prompt: string) =>
  replicate.run(
    'ai-forever/kandinsky-2:601eea49d49003e6ea75a11527209c4f510a93e2112c969d548fbb45b9c4f19f',
    {
      input: {
        prompt,
        width: 768,
        height: 768,
        batch_size: 3,
      },
    }
  );

const generateReply = (prompt: string, res: string[]) =>
  `Here are images for the prompt: *${prompt}*\n\n::: spoiler Images\n${(
    res as string[]
  )
    .map((r) => `![](${r})`)
    .join('\n')}\n:::`;

const mentionIsInRightCommunity = (actorId: string) =>
  new RegExp(`https?:\\/\\/${INSTANCE}\\/c\\/aiart`).test(actorId);

const bot = new LemmyBot({
  instance: INSTANCE,
  credentials: {
    username: USERNAME_OR_EMAIL,
    password: PASSWORD,
  },
  federation: {
    allowList: [
      {
        instance: INSTANCE,
        communities: ['aiart'],
      },
    ],
  },
  dbFile: 'db.sqlite3',
  handlers: {
    async mention({
      mentionView: {
        comment: { id, post_id, content },
        community: { actor_id },
      },
      botActions: { createComment },
    }) {
      if (mentionIsInRightCommunity(actor_id)) {
        const prompt = removeMention(content).trim().replace(/\n/g, '');
        try {
          const res = await generateArt(prompt);

          if (Array.isArray(res)) {
            createComment({
              content: generateReply(prompt, res),
              postId: post_id,
              parentId: id,
            });
          } else {
            createComment({
              content: 'Encountered error while making images',
              postId: post_id,
              parentId: id,
            });
          }
        } catch (e) {
          console.log(e);

          createComment({
            content: 'Encountered error while making images',
            postId: post_id,
            parentId: id,
          });
        }
      } else {
        createComment({
          content: `My apologies comrade, but I only create art in the [AI art community](https://${INSTANCE}/c/aiart). Mention me in a comment there and give me a prompt and I'll make art for you.`,
          postId: post_id,
          parentId: id,
        });
      }
    },
  },
});

bot.start();
