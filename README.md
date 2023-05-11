# lemmy-art-bot

A bot for [lemmy](https://github.com/LemmyNet/lemmy), the fediverse link aggregator, that generates images from text prompts.

# Setup

Install the bot's dependencies with the javascript package manager of your choice.

Create a file called `.env` in the same directory as `bot.ts`. There are 4 environment variables that need to be set:

- `INSTANCE`: The lemmy instance the bot's account belongs to
- `USERNAME_OR_EMAIL`: The username or email of the bot
- `PASSWORD`: The password for the bot's account.
- `API_KEY`: The API key used for the Stable Diffusion API. [Create an API key here if you do not already have one.](https://replicate.com/)
- `RESET_USER`: Username of user who is allowed to reset art bot.

When the bot is setup, it can be started by running `npm start`.

# Usage

To use the bot, mention the bot in a comment in the aiart community and include a prompt. The bot will respond with 3 images made from that prompt.

**Note**: The bot is currently set up to only post in the community !aiart@<your instance>. If you would like it to post in other places, see [the lemmy-bot docs](https://www.npmjs.com/package/lemmy-bot#federation) to find out how to do that.
