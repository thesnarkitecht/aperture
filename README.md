# Aperture

A real-time, browser-rendered cinematic: a lone traveller stands on a floating sky island at
sunset, runs across the grass, leaps off a cliff, free-falls through a sea of clouds, bursts out
beneath them over a vast valley and unfurls a cloth glider towards the setting sun.

You can watch it as a cinematic, interrupt it at any moment, play it yourself, and replay it.

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # production build in dist/
npm run build:single   # self-contained single HTML file in dist-single/
```

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move (camera-relative). While gliding: A/D bank, W dive, S flare |
| Mouse | Look (click to capture the pointer; drag-look fallback) |
| Space | Jump · deploy / fold the glider in the air |
| Shift | Sprint |
| C | Restart the cinematic |
| R | Return to the island (manual mode) |
| Esc | Pause menu: quality, sensitivity, invert Y, volume |
| F3 | Debug overlay (FPS, frame time, draw calls, triangles, states, camera, timeline) |

Any movement key, Space or a large mouse movement during the cinematic hands control to you
seamlessly: the gameplay camera blends in from the cinematic framing.

URL parameters for development: `?quality=ultra|high|medium|low`, `?t=42` (seek the cinematic
to 42 s by deterministically fast-forwarding the simulation), `?mode=manual`.

## The sequence

| Time | Beat |
| --- | --- |
| 0–8 s | Establishing shot over the cloud sea, then a close shot of the hero's idle; the hero looks around |
| 8–14 s | Walk along the worn path |
| 14–29 s | Accelerate into a run, then sprint towards the cliff; the camera drops low and the FOV widens |
| jump | Anticipation crouch, take-off. The camera stays at the edge while the hero flies out |
| +3 s | Shot from below: the island hangs overhead |
| +7 s | Wide falling shot over the cloud sea. A rift in the clouds shows the valley far below |
| cloud | Dive through the cloud deck: whiteout, buffeting, diffuse light |
| exit | The world opens up: valley, river, lake, floating islands, mountain ranges and the sun under the clouds |
| deploy | The wing unfurls from the back clasp; the hero banks onto the valley axis |
| +4–40 s | The camera slowly pulls back until the hero is a small silhouette against the sunset. Control then passes to the player |

## Architecture

```
src/
  core/        math (springs, easing, splines), seeded noise, input, quality presets
  render/      shader library (GLSL chunks), frame pipeline, shadow cascades, GPU noise textures
    shaders/   aw_common, aw_atmosphere, aw_lighting, aw_shadows, aw_clouds
  environment/ precomputed physical sky LUT with art-directed grade
  world/       starting island, GPU grass, CC0 props, distant world (terrain, water, forests,
               floating islands, ruins, horizon, birds)
  character/   controller + state machine, CC0 hero model blend tree, procedural rig/animator
               (drives the glider), glider wing, Verlet scarf
  camera/      gameplay orbit camera and the data-driven cinematic shot list
  audio/       procedural Web Audio soundscape (wind, birds, grass, footsteps, foley, pad)
  ui/          loading screen, controls hint, title card, letterbox, pause menu, F3 overlay
```

### Rendering

- **Technology.** Three.js on WebGL2, with custom GLSL for almost every surface. WebGPU was
  considered. WebGL2 gave the widest browser support and a deterministic custom-shader pipeline
  that can be verified headlessly. The passes are isolated so a WebGPU backend could be added later.
- **Frame.** Two-cascade sun shadows (texel-snapped, rotated-Poisson PCF) → HDR scene
  (RGBA16F, MSAA, float depth) → volumetric clouds → composite → bloom and god rays → final grade.
  - The clouds are ray-marched at reduced resolution through a tileable 3D Perlin-Worley and
    Worley noise field generated on the GPU at load. They use a light march with multi-scatter
    octaves, powder, dual-lobe phase and per-sample aerial perspective.
  - The composite draws the sky LUT, the sun disc and cirrus, and applies aerial perspective
    reconstructed from depth.
  - The final pass applies exposure, a filmic ACES-style tonemap, split-tone grade, vignette,
    chromatic fringe and film grain.
- **Atmosphere.** Rayleigh, Mie and ozone single scattering, plus a multi-scatter term, are
  precomputed into a lat-long LUT and then graded towards the golden-hour palette (blue zenith →
  violet → pink → orange → yellow). All materials share the same sky, fog and ambient functions.
  Ambient light depends on altitude: above the deck the cloud sea bounces warm light; beneath it
  the ceiling is overcast.
- **Stylised lighting.** GGX specular, wrapped diffuse with a soft cel band, thin-surface
  translucency (grass, leaves, fabric) and a sun rim light for silhouettes.
- **Grass.** A fixed pool of GPU-instanced blades on a world-snapped grid around the camera. Height
  and density come from a baked island texture. Gust fields travel across the meadow, and blades
  part around the hero.

### Character and animation

- The controller runs at a fixed 120 Hz. States are ground (walk, run and sprint with
  acceleration and friction), jump anticipation, air (gravity, pose-dependent drag and terminal
  velocity, air control), glide (lift model with bank, dive and flare) and landing (impact scaled
  by speed). Physics is interpolated for rendering.
- The hero model's clips run as one weight-damped blend tree, so every transition crossfades.
  Idle, walk and run are blended by speed, with time scales synced to ground speed. Jump start
  leads into jump idle, which blends with a spread-arm pose for the fall. Glide and land have their
  own blends.
- A second, procedural rig carries the glider. It has two-bone IK legs on foot trajectories, a
  continuous gait phase, leans and head look-at.
- Cinematic mode feeds scripted input into the same controller, so a manual jump reproduces
  the cinematic jump exactly.

### Cinematic shots

`src/camera/Cameras.ts` stores the whole opening as data. Each shot has:
- a start time, either absolute or relative to a story event (`jump`, `cloud`, `exit`, `deploy`),
  so the timing adapts to the simulation;
- a duration, a blend-in time and an easing;
- camera shake;
- two camera specs with position, look target, FOV and roll. A spec can be in the hero's
  heading frame, anchored where the hero was when the shot began, or in world space.

## Graphics settings

Ultra, High, Medium and Low scale these settings:
- render scale and pixel ratio
- MSAA
- shadow map sizes and filter taps
- cloud resolution, step counts and detail noise
- grass density and radius
- forest density
- god rays

High is the default; pick another preset from the pause menu.

## Credits and licences

- Hero: **Rogue (Hooded)** from the *KayKit Adventurers Character Pack 1.0* by Kay Lousberg,
  [CC0 1.0](http://creativecommons.org/publicdomain/zero/1.0/). The shader remaps its greens to an
  original indigo-teal palette. See `src/assets/KAYKIT_LICENSE.txt`.
- Trees, rocks and buildings (windmill, tower, well, the valley hamlets and keep): *KayKit
  Medieval Hexagon Pack 1.0* by Kay Lousberg, CC0 1.0, repacked into self-contained GLBs by
  `scripts/pack-glb.mjs`. See `src/assets/nature/LICENSE.txt` and `src/assets/buildings/LICENSE.txt`.
- Everything else is procedural and original: the sky, clouds, island, terrain, water,
  forests, floating islands, ruins, glider, scarf, shaders and the synthesized audio.

No Nintendo or other proprietary assets, designs, music or UI are used.

Code: MIT (see `LICENSE`).
