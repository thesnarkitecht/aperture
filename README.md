# Aperture — Anatomy of a Rangefinder

A scroll-driven, real-time 3D exploded breakdown of a Leica M6-style rangefinder and a Summilux-M 50 mm f/1.4-style lens, rendered in the browser with [three.js](https://threejs.org).

Every part is procedurally modelled in code — no downloaded meshes, textures or HDRIs — and the camera comes apart chapter by chapter as you scroll:

| # | Chapter | What happens |
|---|---------|--------------|
| 00 | Hero | Assembled camera on a studio turntable |
| 01 | Lens | Lens releases from the M bayonet |
| 02 | Optics | Barrel rings slide off, eight glass elements float with animated light rays converging on the film plane |
| 03 | Aperture | Ten-blade iris closes f/1.4 → f/16 with a live readout |
| 04 | Top plate | Top plate lifts; speed dial, release, advance lever, rewind crank and hot shoe rise; brass gear train turns |
| 05 | Rangefinder | Viewfinder optics, beam splitter, swinging RF mirror, bright-line mask and meter board separate; light paths glow |
| 06 | Chassis | Vulcanite peels off the die-cast body; rear panel and pressure plate pull away |
| 07 | Shutter | Cloth focal-plane shutter slides out and fires on loop |
| 08 | Film | Base plate drops, revealing cassette, film strip and take-up spool |
| 09 | Everything | Full exploded view with an orbiting camera |
| 10 | Reassembled | Everything returns; specs and a chrome / black-paint finish toggle |

## Rendering

- **Studio lighting** — softboxes and strip lights rendered into a PMREM environment for product-shot reflections, plus a shadow-casting key and a cool rim light.
- **Materials** — `MeshPhysicalMaterial` throughout: anisotropic satin chrome, clearcoated black paint, transmissive optical glass with iridescent multi-coating and dispersion, sheen on cloth and vulcanite.
- **Procedural textures** — Worley-noise pebble grain for vulcanite, woven shutter cloth, ribbed frosted glass, turned-metal rings, engraved scales and dials, film stock with sprocket holes, a PCB — all generated on canvases at load.
- **Real geometry** — knurled and scalloped rings, spur gears, springs, threaded collars and screws are modelled, not faked with normal maps.
- **Post** — HDR MSAA render target → bloom → ACES tone mapping → vignette, film grain and subtle chromatic aberration.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds the site and publishes it to GitHub Pages. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions** once.

## Layout

```text
index.html              page shell, overlay UI
src/main.js             bootstrap, scroll timeline, camera, labels, HUD
src/chapters.js         chapter copy, camera keys and callouts
src/core/stage.js       renderer, studio environment, lights, post-processing
src/core/materials.js   PBR material library and finish switch
src/core/textures.js    procedural canvas textures
src/core/geometry.js    lathe / extrude / knurl / gear / screw helpers
src/core/rig.js         explode rig: per-part offsets keyed to scroll
src/parts/*.js          body, top plate, lens, shutter, film, rangefinder, electronics
```

## Disclaimer

An independent 3D study. Not affiliated with or endorsed by Leica Camera AG. Leica, Summilux and the red dot logo are trademarks of their respective owners.

## License

MIT. See [LICENSE](LICENSE).
