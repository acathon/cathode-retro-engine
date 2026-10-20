# The Project Format

Every Cathode game has a `cathode.json` at its root. It says what the game is:
its name, its screen, the controls it supports, and who it is on a store.
`cathode new` writes one, every example in `examples/` carries one, and the
site build and its checks read them.

It is the one place those facts live, so none of them has to be guessed from a
game's code — and a check fails when the file and the game disagree.

## A Complete Example

```json
{
  "format": 1,
  "name": "twenty-one",
  "title": "Twenty-One",
  "version": "1.0.0",
  "description": "Blackjack against a six-deck shoe.",
  "id": "com.example.twentyone",
  "screen": { "width": 464, "height": 360 },
  "orientation": "landscape",
  "input": ["keyboard", "touch"],
  "icon": "assets/icon.png",
  "credits": [
    {
      "what": "Card art",
      "who": "sdkfz181tiger",
      "license": "Free for personal and commercial use",
      "url": "https://sdkfz181tiger.itch.io/assets-for-8bit-playing-card-games"
    }
  ]
}
```

The smallest valid file needs only `format`, `name`, `title`, `version`,
`screen` and `input`.

## Fields

| Field | Required | What it is |
| --- | --- | --- |
| `format` | yes | Always `1`. A file from a newer Cathode is reported as such, not misread. |
| `name` | yes | Lowercase letters, digits and hyphens, e.g. `my-game`. In the repository it must match the folder name. |
| `title` | yes | The name players see, up to 80 characters. |
| `version` | yes | `MAJOR.MINOR.PATCH`, numbers only — `1.0.0`, not `v1.0` or `1.0.0-beta`. The App Store rejects anything else. |
| `description` | no | Up to 500 characters. |
| `id` | no | The game's identity on a store, e.g. `com.example.mygame`. Needed before it can ship to Google Play or the App Store. |
| `screen` | yes | A hardware preset — `{ "profile": "nes" }` — or a size of your own — `{ "width": 320, "height": 240 }`. Not both. |
| `orientation` | no | `landscape` (the default), `portrait` or `any`. |
| `input` | yes | The controls the game really supports: any of `keyboard`, `touch`, `mouse`, `gamepad`. |
| `icon` | no | A `.png` inside the project, e.g. `assets/icon.png`. |
| `credits` | no | Art, music or code by other people: `what`, `who`, and optionally `license` and `url`. |

Unknown fields are errors, not ignored, so a misspelt `"titel"` is reported
instead of silently dropped.

### Screen presets

| Profile | Size | |
| --- | --- | --- |
| `nes` | 256 × 240 | |
| `gameboy` | 160 × 144 | |
| `neogeo` | 320 × 224 | |
| `dos` | 320 × 200 | VGA mode 13h |

These match the engine's own presets in `crates/core/src/config.rs`, and a test
fails if the two ever disagree.

### Why `id` is so strict

It has to work as an Android application ID *and* an iOS bundle ID at once, and
the two stores disagree: Android forbids hyphens, iOS forbids underscores, and
Android requires every part to start with a letter. What both accept is two or
more dot-separated parts made of letters and digits, each starting with a
letter. `com.example.my-game` and `com.example.my_game` are each rejected by one
store; `com.example.mygame` is accepted by both.

Use a domain you control, reversed. If you have none, `io.github.<your-user>`
works and is yours.

### Why `input` matters

A phone has no keyboard. A game that declares only `keyboard` cannot be played
on one — which is the first thing a store reviewer will find. Declare what the
game actually handles, not what you hope to add.

## Checking a File

The validator lives in `packages/project`. It is plain JavaScript, so it runs
unchanged in Node, in the Studio and in the CLI:

```js
import { parseProject, screenSize } from '@cathode/project';

const { project, errors } = parseProject(text);
if (errors.length) console.log(errors.join('\n'));
else console.log(screenSize(project)); // { width: 256, height: 240 }
```

Every error names its field and says what would be valid, for example:

```
version is required as MAJOR.MINOR.PATCH, numbers only — e.g. "1.0.0". The app stores accept nothing else.
input is required: the controls the game supports, from keyboard, touch, mouse, gamepad.
```

## Where It Is Enforced

- **`npm test`** validates every example's `cathode.json` and checks its name
  matches its folder.
- **`npm run build:dist`** refuses to build a game whose file is missing or
  invalid, and publishes each file beside its game.
- **`node scripts/verify/dist.mjs`** runs every published game and fails if
  the screen it sets up differs from the one its file declares.
- **`cathode new`** validates the project it is about to create, so a project
  it makes is valid by construction.
