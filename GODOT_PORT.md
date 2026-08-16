# Godot desktop port blueprint

## First playable milestone

Create a Godot 4 desktop project with keyboard/controller input, one imported
district, one van, the chase camera, rain/wet grip, and the complete order loop:
offer → pickup → timed delivery → rating → payout → local save.

Use separate scenes/resources for:

- `Main.tscn`: boot and loading;
- `World.tscn`: district, weather, lighting, delivery points;
- `Van.tscn`: model, wheels, lights, collision, audio emitters;
- `HUD.tscn`: Korean-first bilingual controller-aware UI;
- typed resources: restaurants, dishes, tuning, upgrades, weather presets.

## Systems

`VehicleController` owns raycast-wheel suspension, tire forces, drivetrain,
wet grip, body collisions, and crash events. Keep this behind an interface so
the physics backend can be improved without rewriting delivery gameplay.

`DeliveryManager` owns the browser-proven state machine and emits events rather
than calling UI or audio directly. `AudioManager` owns buses, music, ambience,
engine layers, tire materials, impacts, and accessibility controls.

`SaveService` writes versioned local data and migrates older saves. Never make
scene nodes the source of truth for progression.

## Expansion order

1. Feature parity with the browser slice.
2. Better collisions, impacts, and vehicle presentation.
3. Multiple vehicles and upgrades.
4. District streaming and additional delivery content.
5. Traffic, ambience, shifts, weather variants, and richer progression.
6. Desktop settings, rebinding, graphics presets, controller remapping, and
   save export/backup.
