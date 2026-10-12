# SiteFlow Web

TC1 procedural preview with Orbit/Pan/Zoom. Run `npm run dev` or `npm run build`.
The JSON in public/data contains only TC1 fields needed by the web model and schema/unit/coordinate checks. Personal information, local paths, other site data and metadata are excluded. The original JSON is unchanged; positions and meters are preserved without conversion.
Hierarchy: TC1 > Fixed Tower > Rotating Upper > Jib > Trolley > Wire/Hook; Counter Jib is under Rotating Upper.
Upper pivot is at the tower top centre; trolley translation uses local Z.
Section sizes, counterweight, trolley position and suspended length are visual approximations based on the Unity preview. Upper rotation supports a slider and automatic start/stop; trolley and hoist controls are not implemented.

## GitHub Pages preparation

Repository: https://github.com/widdnis/siteflow-crane-web
Vite base: `/siteflow-crane-web/` (also used by the local dev server).
The repository root must contain the contents of this SiteFlow-Web folder, including `.github/workflows/deploy.yml`, package.json and package-lock.json.
Before deployment, set repository Settings > Pages > Source to GitHub Actions, then push the web project to main. The workflow builds with Node 24 and deploys only dist. No push or Pages deployment has been performed during preparation.
