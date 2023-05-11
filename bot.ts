import LemmyBot, { PostFeatureType, SortType } from 'lemmy-bot';
import Replicate from 'replicate';
import { config } from 'dotenv';
import fetch from 'cross-fetch';

config();
const { INSTANCE, USERNAME_OR_EMAIL, PASSWORD, API_KEY, RESET_USER } =
  process.env as Record<string, string>;

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
      botActions: { createComment },
    }) {
      if (mentionIsInRightCommunity(actor_id) && postId === currentThread) {
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
          content: `My apologies comrade, but I only create art in the active art thread in the [AI art community](https://${INSTANCE}/c/aiart).\n\n[Here is the current art thread.](https://${INSTANCE}/post/${currentThread}) Mention me in a comment there and give me a prompt and I'll make art for you.`,
          postId: post_id,
          parentId: id,
        });
      }
    },
    privateMessage: ({
      botActions: { sendPrivateMessage },
      messageView: {
        creator: { id: creatorId, name },
        private_message: { content },
      },
    }) => {
      const messageNumber = parseInt(content, 10);
      if (name === RESET_USER && !isNaN(messageNumber)) {
        currentThread = messageNumber;
        sendPrivateMessage({
          recipientId: creatorId,
          content: `Resetting the current thread to ${currentThread}`,
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

          if (comments >= 500) {
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
                body: 'If you like any of the images in the comments, be sure to save them. Image links disappear after a day or two!',
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
