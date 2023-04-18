#!/usr/bin/env ts-node

import LemmyBot from "lemmy-bot";
import Replicate from "replicate";
import { config } from "dotenv";

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
        ""
      )}(\\s*\\]\\(.*\\))?`,
      "g"
    ),
    ""
  );

const generateArt = (prompt: string) =>
  replicate.run(
    "stability-ai/stable-diffusion:db21e45d3f7023abc2a46ee38a23973f6dce16bb082a930b0c49861f96d1e5bf",
    {
      input: {
        prompt,
        num_outputs: 4,
      },
    }
  );

const bot = new LemmyBot({
  instance: INSTANCE,
  credentials: {
    username: USERNAME_OR_EMAIL,
    password: PASSWORD,
  },
  dbFile: "db.sqlite3",
  handlers: {
    async mention({
      mentionView: {
        comment: { id, post_id, content },
      },
      botActions: { createComment },
    }) {
      const prompt = removeMention(content).trim();
      try {
        const res = await generateArt(prompt);

        if (Array.isArray(res)) {
          const reply = `Here are images for the prompt: *${prompt}*\n\n${(
            res as string[]
          )
            .map((r) => `![${prompt}](${r})`)
            .join("\n")}`;

          createComment({
            content: reply,
            postId: post_id,
            parentId: id,
          });
        } else {
          createComment({
            content: "Encountered error while making images",
            postId: post_id,
            parentId: id,
          });
        }
      } catch (e) {
        console.log(e);

        createComment({
          content: "Encountered error while making images",
          postId: post_id,
          parentId: id,
        });
      }
    },
  },
});

bot.start();
