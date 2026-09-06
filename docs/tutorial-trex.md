# Tutorial: Building a T-Rex Runner Game

In this tutorial, we will build a clone of the classic Chrome T-Rex Dinosaur game using the **Cathode SDK** and TypeScript. You'll learn how to load sprites, handle keyboard inputs, implement a rudimentary physics system for jumping, and set up simple AABB collision detection!

## 1. Project Setup
We will use the Cathode CLI to scaffold our project. Assuming you have the CLI installed globally or are running it via `npx`:

```bash
cathode new trex-game
cd trex-game
npm install
```

Start the local development server:
```bash
npm run dev
```

## 2. Preparing the Spritesheet
Create an image `sprites.png` in your `public/` directory (e.g., 32x16 pixels containing two 16x16 frames: the T-Rex on the left and a Cactus on the right).

## 3. The Game Loop & Scene
Open `src/main.ts` and set up the Cathode. We'll use the `Game Boy` preset for that authentic 160x144 green-tinted aesthetic.

```typescript
import { Cathode, Scene, Sprite } from '@cathode/sdk';

async function init() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  
  // Build the engine with Game Boy properties (160x144) 3x scaled
  const engine = await Cathode.gameboy(canvas, 3);
  const scene = new Scene(engine);

  // Load our spritesheet (16x16 pixel frames)
  const sheet = await engine.loadSheet('/sprites.png', 16, 16);

  // ... (Physics and Entities go here) ...

  // Start the game loop
  engine.loop((dt) => {
    scene.update(dt);
  });
}

init();
```

## 4. Building the T-Rex Player
We'll create the player entity and give him some physics logic!

```typescript
  // 1. Create the T-Rex Sprite
  // Frame 0 is our dinosaur.
  const trex = new Sprite(scene, { x: 20, y: 100, sheet, frame: 0 });
  
  // 2. Physics properties
  let velocityY = 0;
  const gravity = 800;        // pixels per second squared
  const jumpStrength = -250;  // negative Y is up
  let isJumping = false;

  // 3. Update callback
  trex.onUpdate = (dt) => {
    // Apply gravity
    velocityY += gravity * dt;
    trex.y += velocityY * dt;
    
    // Floor collision
    if (trex.y >= 100) {
      trex.y = 100;
      velocityY = 0;
      isJumping = false;
    }
    
    // Custom Jump Input Handling:
    // We map 'Z' on the keyboard to player 0's 'A' button
    if (engine.input.justPressed(0, 'a') && !isJumping) {
      velocityY = jumpStrength;
      isJumping = true;
      
      // Play a quick "jump" sound using the triangle wave generator!
      // Channel 0, 400Hz, Waveform 2 (Triangle), 50% Volume
      engine.audioPlay(0, 400, 2, 0.5); 
    }
  };
```

## 5. Infinite Cacti Obstacles
Next, we'll spawn a cactus that moves to the left and respawns when it goes off screen.

```typescript
  // Frame 1 is our cactus.
  const cactus = new Sprite(scene, { x: 160, y: 100, sheet, frame: 1 });
  
  cactus.onUpdate = (dt) => {
    // Move left at 100 pixels per second
    cactus.x -= 100 * dt;
    
    // If it leaves the left edge of the screen, wrap it to the right
    if (cactus.x < -20) {
      // Random respawn distance between 160 and 360
      cactus.x = 160 + Math.random() * 200;
    }
    
    // Collision Detection check with the T-Rex!
    // Using a 12x12 hitbox so it's a bit forgiving.
    if (trex.overlaps(cactus, 12, 12)) {
        // Play crash sound: Channel 1, 150Hz, Waveform 4 (Noise), 80% Volume
        engine.audioPlay(1, 150, 4, 0.8);
        
        console.log("GAME OVER!");
        
        // Stop the engine tick to freeze the game
        engine.pause(); 
    }
  };
```

## 6. Play and Extend
That's it! You have a working, performant WASM-powered T-Rex runner. To expand on this:
1. Add an `AnimConfig` to animate the T-Rex legs running.
2. Use `engine.loadTileMap` to add a scrolling background (clouds, mountains).
3. Track an internal score variable, increasing it by `dt`, and display it on the page UI overlay!

You can run `npm run build` to package your game and host it anywhere!
