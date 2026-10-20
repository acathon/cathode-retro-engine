# Shipping to Android and iOS

`cathode export` turns your game into a phone app. The same command makes a
build to try on your own phone and the build you upload to Google Play or the
App Store.

```bash
cathode export android            # a test APK, in out/
cathode export android --run      # ...installed and started on your phone
cathode export ios                # a build for the iOS Simulator (on a Mac)
cathode export android --release  # an .aab for Google Play
cathode export ios --release      # an .ipa for the App Store (on a Mac)
```

The game inside the app is the same one that runs in the browser, controls
and all — see [Games on Phones](./mobile.md). Nothing in your code changes.

## Getting the `cathode` Command

Until Cathode is published, install the command from your clone of this
repository. `cathode export` has to run inside your game's folder, so it
needs to be on your PATH:

```bash
cd cathode-retro-engine
npm install
npm run build:cli
npm install -g ./packages/cli
```

Then `cathode new my-game` makes a game, and `cathode export` works inside it.

## What You Need

| To build for | You need |
| --- | --- |
| Android | [Android Studio](https://developer.android.com/studio). It brings the Android SDK and the Java 21 that the build needs. |
| iOS | A Mac with Xcode 26 or later, from the Mac App Store. Apple accepts nothing built with older versions. |
| Google Play | A [Google Play developer account](https://play.google.com/console) (a one-off fee). |
| The App Store | The [Apple Developer Program](https://developer.apple.com/programs/) (a yearly fee). |

No Mac? GitHub can build the iOS app for you — see
[Building on GitHub](#building-on-github).

If Android Studio is installed somewhere unusual, set `ANDROID_HOME` to the
SDK folder and `JAVA_HOME` to Android Studio's `jbr` folder.

## cathode.json Decides

Everything the stores see comes from your [`cathode.json`](./project-format.md):

| Field | Becomes |
| --- | --- |
| `title` | The name under the icon. |
| `id` | The app's identity on both stores: the Android application ID and the iOS bundle ID. **It can never change after the first upload.** |
| `version` | The version players see, and the build number the stores compare. `1.2.3` becomes build `1002003`, so each new version counts higher. |
| `orientation` | Which way the phone is held: `landscape` (either way up), `portrait`, or `any`. On an iPad the game turns every way and the engine fits it, because iPadOS 26 asks every app to. |
| `icon` | The app icon and the launch screen, in every size each store asks for. |

`cathode new` writes a stand-in `id` like `com.example.mygame`, which is fine
for testing. Before a store build, change it to something only you would use:
reverse a domain you own, or your GitHub account —
`"id": "io.github.yourname.mygame"`.

### The Icon

Point `icon` at a square PNG:

```json
"icon": "assets/icon.png"
```

- **Pixel art** can be any size, even 16 × 16. It is scaled up by whole
  steps, so every pixel stays square and sharp.
- **A sprite on a transparent background** is set on black, with room
  around it so no phone's icon shape clips it.
- **Artwork with no transparency** fills each icon shape edge to edge. Make
  it at least 1024 × 1024 so it isn't scaled up.

The launch screen is your icon, centred on black. Without an icon, test
builds get a placeholder: the first letter of the title on a colour of its
own. Store builds refuse to go without one.

## Trying It on Your Phone

**Android:** turn on [USB debugging](https://developer.android.com/studio/debug/dev-options),
plug the phone in, and run `cathode export android --run`. An emulator from
Android Studio works the same way. You can also copy the APK in `out/` to the
phone and open it.

**iPhone:** `cathode export ios --run` starts it in the iOS Simulator. To put
it on your own iPhone, run `cathode export ios --open`, choose your team
under *Signing & Capabilities* in Xcode, and press Run with the phone
selected.

## Store Builds

### Google Play

Play needs every upload signed with your **upload key**. Make one, once:

```bash
keytool -genkeypair -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

Keep `upload.jks` and its password safe, and **out of your repository**. If
you lose it, Play can reset it, but it takes days. Then:

```bash
export CATHODE_KEYSTORE=/path/to/upload.jks
export CATHODE_KEYSTORE_PASSWORD='...'
export CATHODE_KEY_ALIAS=upload
# CATHODE_KEY_PASSWORD too, if the key's password differs from the keystore's.
cathode export android --release
```

Upload `out/my-game-1.0.0.aab` in the Play Console. The passwords are read
from the environment while the build runs and are never written into the
project.

### The App Store

1. Find your Team ID in your [Apple Developer account](https://developer.apple.com/account), under *Membership*.
2. In [App Store Connect](https://appstoreconnect.apple.com), create the app with the same bundle ID as the `id` in `cathode.json`.
3. On your Mac, signed in to Xcode with your Apple account:

   ```bash
   CATHODE_APPLE_TEAM=ABCDE12345 cathode export ios --release
   ```

4. Upload `out/my-game-1.0.0.ipa` with Apple's
   [Transporter](https://apps.apple.com/app/transporter/id1450874784) app.

Xcode creates the signing certificate and profile itself. To sign where
nobody is signed in to Xcode, such as on GitHub, also set an
[App Store Connect API key](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api):
`CATHODE_ASC_KEY` (the `.p8` file), `CATHODE_ASC_KEY_ID` and `CATHODE_ASC_ISSUER`.

**Every upload needs a higher `version`** in `cathode.json`, on both stores.

## What Gets Made

| | |
| --- | --- |
| `dist/` | The web build that the app wraps. |
| `native/android`, `native/ios` | The Android Studio and Xcode projects, made by [Capacitor](https://capacitorjs.com) 8. |
| `out/` | The APK, App Bundle, simulator app or `.ipa`. |
| `capacitor.config.json` | Capacitor's settings, written from `cathode.json`. |

All of it is rebuilt from `cathode.json` on every export, and `cathode new`
leaves all of it out of git. **Don't edit `native/`**: changes there are
overwritten, and if the `id` changes it is made again from scratch. Change
`cathode.json` instead.

The first export adds Capacitor to your project's `devDependencies`. The app
shows the game full screen, with no status or navigation bar; a swipe from
the edge brings them back for a moment.

## Building on GitHub

This repository builds both apps on every change, in
[`.github/workflows/mobile.yml`](../.github/workflows/mobile.yml). It makes a
game with `cathode new`, then:

- exports an Android test build, and plays it on an Android emulator;
- exports an iOS build on a Mac runner, and plays it in the iOS Simulator;
- exports a signed App Bundle with a throwaway key.

Copy that workflow into your game's repository to build there. Instead of
`cathode new`, check out this repository beside your game to get the
command. Store your upload key, passwords and Apple key as
[repository secrets](https://docs.github.com/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions).

## When It Goes Wrong

| It says | Do this |
| --- | --- |
| *needs the Android SDK* | Install Android Studio, open it once so it downloads the SDK, or set `ANDROID_HOME`. |
| *needs Java 21* | Set `JAVA_HOME` to Android Studio's `jbr` folder (on a Mac, `/Applications/Android Studio.app/Contents/jbr/Contents/Home`). |
| *needs a Mac with Xcode* | iOS apps can only be built on macOS. Use [Building on GitHub](#building-on-github). |
| *needs Xcode 26 or later* | Update Xcode from the Mac App Store. |
| *needs your own "id"* | Set `id` in `cathode.json`; see [cathode.json Decides](#cathodejson-decides). |
| *No Android phone or emulator is connected* | Check that `adb devices` lists it, and accept the prompt on the phone. |

## What Is and Isn't Proven

On every change, CI builds the Android app and plays it on an Android 15
emulator. It checks that the game draws, shows no status or navigation bar,
is held landscape, and answers a finger on the d-pad. CI also builds the iOS app with
Xcode 26 and plays it in the iOS Simulator, checking that it draws and logs
no errors. It signs an App Bundle and verifies the signature.

What CI can't do is sign for the App Store: that needs an Apple Developer
account. The `--release` path for iOS follows Apple's documented `xcodebuild`
archive-and-export steps, but it has not been run against a real account.
If it fails for you, the Xcode project in `native/ios` can still be archived
from Xcode's *Product → Archive* menu.
