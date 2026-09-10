// Headless Blender recipes. The Python file is the source of truth; the GLB
// is a build product that `npm run food` copies into public/assets.
// `preview` is required — a recipe without a PNG is unfinished.
export const RECIPES = {
  'tteokbokki-cup': {
    script: 'recipes/tteokbokki_cup.py',
    out: '_source-assets/food/tteokbokki-cup.glb',
    public: 'public/assets/food/tteokbokki-cup.glb',
    preview: 'tools/blender/previews/tteokbokki-cup.png',
    kind: 'food',
    budgetTris: 8000,
    minM: 0.06,
    maxM: 0.22,
  },
  'hotteok': {
    script: 'recipes/hotteok.py',
    out: '_source-assets/food/hotteok.glb',
    public: 'public/assets/food/hotteok.glb',
    preview: 'tools/blender/previews/hotteok.png',
    kind: 'food',
    budgetTris: 8000,
    minM: 0.08,
    maxM: 0.22,
  },
  'soondae-platter': {
    script: 'recipes/soondae_platter.py',
    out: '_source-assets/food/soondae-platter.glb',
    public: 'public/assets/food/soondae-platter.glb',
    preview: 'tools/blender/previews/soondae-platter.png',
    kind: 'food',
    budgetTris: 8000,
    minM: 0.10,
    maxM: 0.22,
  },
  'banana-milk': {
    script: 'recipes/banana_milk.py',
    out: '_source-assets/food/banana-milk.glb',
    public: 'public/assets/food/banana-milk.glb',
    preview: 'tools/blender/previews/banana-milk.png',
    kind: 'food',
    budgetTris: 4000,
    minM: 0.06,
    maxM: 0.16,
  },
};
