import LemmyBot from 'lemmy-bot';
import Replicate from 'replicate';
import { config } from 'dotenv';
import fetch from 'cross-fetch';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

config();
const { INSTANCE, USERNAME_OR_EMAIL, PASSWORD, API_KEY } =
  process.env as Record<string, string>;

const threadRegex = /[A-Za-z\s]*(\d+)/;

let currentThread: number;

const replicate = new Replicate({
  auth: API_KEY,
  fetch,
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
    .join(
      '\n'
    )}\n:::\n\n**If you like one of these images, be sure to save it. Image links disappear after a day or two!**`;

const mentionIsInRightCommunity = (actorId: string) =>
  new RegExp(`https?:\\/\\/${INSTANCE.replace(/:.*/, '')}\\/c\\/aiart`).test(
    actorId
  );

async function start() {
  currentThread = parseInt(
    (await readFile(path.resolve('./current_post.txt'))).toString(),
    10
  );

  bot.start();
}

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
      botActions: { createComment },
    }) {
      if (mentionIsInRightCommunity(actor_id) && postId === currentThread) {
        const prompt = removeMention(content).trim().replace(/\n/g, '');
        try {
          const res = await generateArt(prompt);

          if (Array.isArray(res)) {
            await createComment({
              content: generateReply(prompt, res),
              post_id,
              parent_id: id,
            });
          } else {
            await createComment({
              content: 'Encountered error while making images',
              post_id,
              parent_id: id,
            });
          }
        } catch (e) {
          console.log(e);

          await createComment({
            content: 'Encountered error while making images',
            post_id,
            parent_id: id,
          });
        }
      } else {
        await createComment({
          content: `My apologies comrade, but I only create art in the active art thread in the [AI art community](https://${INSTANCE}/c/aiart).\n\n[Here is the current art thread.](https://${INSTANCE}/post/${currentThread}) Mention me in a comment there and give me a prompt and I'll make art for you.`,
          post_id,
          parent_id: id,
        });
      }
    },
    post: {
      sort: 'NewComments',
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
            await writeFile(
              path.resolve('./current_post.txt'),
              currentThread.toString(),
              {
                flag: 'w',
              }
            );
          }

          if (comments >= 300) {
            await Promise.all([
              lockPost({ locked: true, post_id: id }),
              featurePost({
                post_id: id,
                featured: false,
                feature_type: 'Community',
              }),
              (async () => {
                const community_id = await getCommunityId('aiart');

                if (community_id) {
                  await createPost({
                    community_id,
                    name: `Art Thread ${
                      parseInt(name.match(threadRegex)![1], 10) + 1
                    }`,
                    body: 'If you like any of the images in the comments, be sure to save them. Image links disappear after a day or two!',
                  });
                }
              })(),
            ]);
          } else if (!featured_community) {
            await featurePost({
              post_id: id,
              featured: true,
              feature_type: 'Community',
            });
          }
        }
      },
    },
  },
});

start();
