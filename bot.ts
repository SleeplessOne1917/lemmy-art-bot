#!/usr/bin/env ts-node

import LemmyBot, { PostFeatureType, SortType } from 'lemmy-bot';
import Replicate from 'replicate';
import { config } from 'dotenv';
import fetch from 'cross-fetch';

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
        batch_size: 4,
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
  new RegExp(`https?:\\/\\/${INSTANCE.replace(/:.*/, '')}\\/c\\/aiart`).test(
    actorId
  );

const threadRegex = /[A-Za-z\s]*(\d+)/;

let currentThread: number | undefined = undefined;

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
        post: { id: postId },
      },
      botActions: { createComment, uploadImage },
    }) {
      if (mentionIsInRightCommunity(actor_id) && postId === currentThread) {
        const prompt = removeMention(content).trim().replace(/\n/g, '');
        try {
          const res = await generateArt(prompt);

          if (Array.isArray(res)) {
            const images = await Promise.all(
              res.map((i) =>
                fetch(i)
                  .then((r) => r.blob())
                  .then((blob) => blob.arrayBuffer())
              )
            );
            const links = (
              await Promise.all(
                images.map(async (blob) =>
                  uploadImage(Buffer.from(blob)).then((i) => i.url)
                )
              )
            ).filter((i) => i) as string[];

            createComment({
              content: generateReply(prompt, links),
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
          content: `My apologies comrade, but I only create art in the active art thread in the [AI art community](https://${INSTANCE}/c/aiart).\n\n[Here is the current art thread.](https://${INSTANCE}/post/${currentThread}) Mention me in a comment there and give me a prompt and I'll make art for you.`,
          postId: post_id,
          parentId: id,
        });
      }
    },
    post: {
      sort: SortType.Active,
      minutesUntilReprocess: 1,
      async handle({
        postView: {
          creator: { actor_id },
          post: { locked, id, name, featured_community },
          counts: { comments },
        },
        botActions: { featurePost, lockPost, createPost, getCommunityId },
      }) {
        if (
          actor_id.includes(
            `${INSTANCE.replace(/:.*/, '')}/u/${USERNAME_OR_EMAIL}`
          ) &&
          !locked
        ) {
          if (!currentThread) {
            currentThread = id;
          }

          if (comments >= 5) {
            lockPost({ locked: true, postId: id });
            featurePost({
              postId: id,
              featured: false,
              featureType: PostFeatureType.Community,
            });

            const communityId = await getCommunityId('aiart');

            if (communityId) {
              createPost({
                communityId,
                name: `Art Thread ${
                  parseInt(name.match(threadRegex)![1], 10) + 1
                }`,
              });
            }
          } else if (!featured_community) {
            featurePost({
              postId: id,
              featured: true,
              featureType: PostFeatureType.Community,
            });
          }
        }
      },
    },
  },
});

bot.start();
