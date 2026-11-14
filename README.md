# 仙人跳 · Fairy jump

Browser game with touch and keyboard controls. Open `index.html` directly or serve the project as a static site. Hold to charge and release to jump. In both forms, the character dips slightly before takeoff and bends their knees on landing before standing back up.

## Underground rescue mission

The rescue point is 15 km from the starting point. Each jump that lands in a new cavity digs up to 50 m based on charge. Each jump can drift up to 10° from the previous heading in any direction. If the angle to the active target exceeds 30°, the heading automatically realigns. The next cavity is carved along that heading, which is recorded when the character lands. Near a destination, the next cavity lines up with the target so an in-range jump ends there.

The character swallows isolated spherical cavities in the rock. At the scene scale, the character is 1.75 m tall, the cavities give them a little standing room, and the first cavities are spaced about 8–8.8 m centre to centre. Releasing the charge opens a portal ahead of the character. While entering, the character emerges in sync from the exit above the estimated landing. A precise jump lands in the prepared cavity. Otherwise the character can carve a new cavity at the landing point. If at least one third of its volume overlaps the prepared cavity, both cavities join into one opening and the jump is free. A smaller overlap uses one of the master's three corrections and leaves separate openings.

The HUD shows the straight-line distance to the active target, total distance dug and last jump. Depth starts at −1,800 m and becomes more negative as the character digs deeper. The overhead mini-map shows the outbound path in teal and the return path in amber. After reaching the rescue point, the next jump transforms the character into a rabbit. Return to the starting point to complete the mission.

## GitHub Pages

Upload these files to the root of a repository, preserving the assets directory.
In Settings > Pages, choose Deploy from a branch, main and /(root), then Save.
Use the published website link to play. Opening index.html in the repository shows source.

## Controls

- Mouse or touch: hold and release.
- Space: hold and release.
- M or the sound button: toggle sound.
- Landing hint button: toggle the optional landing indicator.

Best scores and landing-hint preferences are stored locally in each browser.
