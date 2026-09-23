# Aperture — Anatomy of a Rangefinder

A scroll-driven, real-time 3D exploded breakdown of a Leica M11 digital rangefinder and a Summilux-M 50 mm f/1.4 ASPH lens, rendered in the browser with [three.js](https://threejs.org).

Every part is procedurally modelled in code — no downloaded meshes, textures or HDRIs. There is no copy on the page: just the camera. Scroll and it comes apart, beat by beat, while a third-person camera orbits around it:

1. Assembled hero on a studio sweep
2. Lens releases from the M bayonet
3. Barrel rings and the telescopic hood slide off; eight glass elements float with animated light rays converging on the sensor plane
4. Ten-blade iris closes from f/1.4 to f/16
5. Top plate lifts; the pull-up ISO dial (with its red unlock band), shutter-speed dial, release and main switch, function button and hot shoe rise above the encoder flex
6. Viewfinder optics, beam splitter, swinging rangefinder mirror, LED frame-line module and bright-line mask separate; light paths glow
7. Leatherette peels off the magnesium chassis; the rear cover, PLAY / FN / MENU buttons, d-pad and the touchscreen stack pull away as the screen lights up
8. The vertical metal-blade shutter, the 60 MP BSI-CMOS sensor module (IR-cut cover glass, ceramic package, bond wires, alignment springs) and the Maestro III main board fan out
9. The BP-SCL7 battery drops out with the bottom plate, SD card, USB-C port and tripod socket
10. Full exploded view with an orbiting camera
11. Everything reassembles

Drag to spin the model; the two swatches switch between silver chrome and black paint.

## Rendering

- **Studio lighting** — feathered softboxes and strip lights rendered into a PMREM environment for product-shot reflections, plus a shadow-casting key and a cool rim light.
- **Materials** — `MeshPhysicalMaterial` throughout: anisotropic satin chrome, clearcoated black paint, transmissive optical glass with iridescent multi-coating and dispersion, sheen on cloth and vulcanite.
- **Procedural textures** — Worley-noise pebble grain (normal + roughness) for vulcanite, brushed-metal roughness streaks, woven shutter cloth, ribbed frosted glass, turned-metal rings, engraved scales and dials, film stock with sprocket holes, a PCB — all generated on canvases at load.
- **Real geometry** — knurled and scalloped rings, spur gears, springs, threaded collars and screws are modelled, not faked with normal maps.
- **Post** — HDR MSAA render target → GTAO ambient occlusion → HDR highlight clamp → bloom → ACES tone mapping → vignette, film grain and subtle chromatic aberration.

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
src/main.js             bootstrap, scroll timeline, camera, interaction
src/chapters.js         camera keys for each scroll beat
src/core/stage.js       renderer, studio environment, lights, post-processing
src/core/materials.js   PBR material library and finish switch
src/core/textures.js    procedural canvas textures
src/core/geometry.js    lathe / extrude / knurl / gear / screw helpers
src/core/rig.js         explode rig: per-part offsets keyed to scroll
src/parts/*.js          body, top plate, lens, rangefinder, digital internals (sensor, shutter, board, display, battery)
```

## Disclaimer

An independent 3D study. Not affiliated with or endorsed by Leica Camera AG. Leica, Summilux and the red dot logo are trademarks of their respective owners.

## License

MIT. See [LICENSE](LICENSE).
