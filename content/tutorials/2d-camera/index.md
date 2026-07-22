---
title: 2D Camera
description: Learn how to build a reusable 2D camera from scratch while understanding the concepts behind world space, screen space, and transformation matrices.
date: 2026-07-22
---

# 2D Camera

Sooner or later, every game runs into the same problem.

You start with a player standing in the middle of an empty window. Everything fits on the screen, so drawing your game is as simple as calling `SpriteBatch.Draw()` with each sprite's position.

Then your game begins to grow.

You add a larger level, more enemies, and buildings, maybe an entire town to explore. Before long, your world is much larger than the game window, and you have a new problem to solve.

**How does the player see the rest of the world?**

This is where cameras come in.  Despite the name, a camera isn't something unique to game development. It's simply a way of deciding **what part of your game world should be visible to the player at any given moment.**

Whether you're making a side-scroller, a top-down RPG, or a strategy game, chances are you'll need a camera.

In this tutorial, we'll build a reusable `Camera2D` class from scratch. Along the way, we'll explore the concepts that make cameras work, including world space, screen space, and transformation matrices. By the end, you won't just have a camera you can drop into your own project, you'll understand *why* it works and how to extend it with your own features later.

---

## Before You Begin

This tutorial assumes you're already comfortable with the basics of MonoGame. In particular, you should know how to:

- Create a MonoGame project.
- Draw sprites using `SpriteBatch`.
- Work with basic C# classes.
- Use the `Vector2` type.

If you're comfortable with those topics, you're ready to build a camera.

---

## What You Will Build

By the end of this tutorial, you'll have a reusable camera that supports:

- Moving around the game world.
- Rotation.
- Zooming in and out.
- Converting between world and screen coordinates.
- Easy integration with `SpriteBatch`.

More importantly, you'll understand the concepts behind the implementation. Those same ideas are used throughout game development, and they'll become the foundation for future features like camera following, camera shake, world boundaries, and editor tools.

> [!SUCCESS] **Takeaway**
>
> Don't think of this tutorial as "learning how to write a camera."  Think of it as learning how games decide **what the player sees**. Once the idea clicks, the code becomes much easier to understand.

---

## Why Do Games Need Cameras?

When you first start making games, it's easy to avoid thinking about cameras altogether. In simple games like Pong or Snake, the entire world fits comfortably inside the game window. If your player is standing at `(400, 200)`, you simply draw them at `(400, 200)`. There isn't really a camera, because there doesn't need to be one.

Eventually, though, every game reaches the same milestone: the world becomes larger than the screen. Imagine a top-down adventure game with a map that stretches thousands of pixels in every direction. The player can only see a small fraction of it at any given moment.

So what happens when they start walking? One approach is to move everything else in the opposite direction; every tree, every enemy, every tile. Technically, that works. If you've ever built a scrolling game without a camera, it's probably exactly what you did.

But if you stop and think about it, something feels a little strange. The trees aren't actually moving. The world hasn't changed at all. Only **the player's view of that world** has changed.

That observation is the key to understanding cameras. Rather than moving every object in the world, we leave the world exactly where it is and instead change **which part of the world the player is looking at.**

![A camera acts as a window into a much larger game world. Objects remain fixed in world space while the camera determines which portion of that world is visible.](figure-1.png)

> **Figure 1:** A camera acts as a window into a much larger game world. Objects remain fixed in world space while the camera determines which portion of that world is visible.

### Why It Still Looks Like the World Is Moving

If you've played almost any 2D game, something about this still doesn't quite add up. When the player walks right, the entire world appears to slide left. The trees move. The buildings move. It certainly *looks* like the world is moving.

Here's what's actually happening: the world exists independently of the camera. Every tree, enemy, and wall has a fixed position within it, and those positions don't change just because the player started walking. Instead, the camera moves to a new location, and a different portion of the world becomes visible.

![The objects in the world never change position.  As the camera moves, the visible portion of the world changes, creating the illusion that everything else is moving.](figure-2.png)

> **Figure 2:** The objects in the world never change position. As the camera moves, the visible portion of the world changes, creating the illusion that everything else is moving.

This is why camera systems are so flexible. Following the player means moving the camera. Zooming means changing how much of the world the camera can see. Screen shake means temporarily offsetting the camera's position. The world itself never needs to know any of this happened.

> [!SUCCESS] **Takeaway**
> A camera never moves the world. It changes how the world is viewed, and that alone creates the illusion that everything else is moving.

Now for the next question: our player, trees, and enemies all have positions in the game world. So how does MonoGame know **where they should actually appear on the screen?** To answer that, we need to understand the difference between **world space** and **screen space**.

---

## What Is the Difference Between World Space and Screen Space?

So far we've talked about two different places without naming them: the game world itself, where your player, enemies, and everything else actually exist, and the game window, where those objects are eventually drawn. These use different coordinate systems, **world space** and **screen space**.

### World Space

World space describes where something exists inside the game world. Imagine your map is 8,000 pixels wide and 4,000 pixels tall. A tree might be located at `(2400, 800)`, and your player might be standing at `(3180, 1460)`. These positions don't tell you whether the objects are currently visible, they only answer one question:  **Where does this object exist in the game world?**

World positions stay stable. If a tree is standing at `(2400, 900)`, moving the camera doesn't move the tree, it only changes where that position appears on the screen.

### Screen Space

Screen space describes where something appears inside the game window. Unlike the world, it's limited to the size of the viewport. If your game window is 1,280 by 720 pixels, its coordinates look like this:

![A 1,280 by 720 pixel game window showing the top-left coordinate at (0, 0), the top-right coordinate as (1280, 0), the bottom-right coordinate as (1280, 720), and the bottom-left coordinate as (0, 720)](game-window-coordinates.png)

As with most 2D rendering systems, MonoGame places the origin at the top-left corner of the viewport: moving right increases X, moving down increases Y, and `(0, 0)` is the top-left corner of the window. A sprite drawn at `(100, 50)` appears 100 pixels from the left edge and 50 pixels from the top.

Screen space answers a different question:  **Where should this object appear inside the game window?**

![World space describes where an object exists in the game world, while screen space describes where an object appears inside the game window.](figure-3.png)

> **Figure 3:** World space describes where an object exists in the game world, while screen space describes where the object appears inside the game window.

The player has only one actual position in the world, `(3180, 1460)`. Viewed through the camera, though, that same player appears at `(380, 260)` inside the window.

### Converting Between the Two Spaces

Ignoring rotation and zoom for a moment, converting between the two spaces is just subtraction. Suppose the camera is positioned at `(2800, 1200)` and the player is at `(3180, 1460)`:

```text
Player world position - Camera position = Player screen position
```

which would be:

```text
(3180, 1460) - (2800, 1200) = (380, 260)
```

If the camera moves 100 pixels right, that value is subtracted from every object's world position, so each object appears 100 pixels farther left on screen.

> [!TIP] **Why subtraction?**
> The camera's position represents the world coordinate we're viewing from. Subtracting it makes that position the new origin of the screen.

Later, a transformation matrix will perform this same operation for every sprite automatically, while also accounting for rotation, zoom, and an origin.

World space and screen space aren't competing versions of the same position, they serve different jobs. Gameplay logic like movement, collisions, and spawning works in world space, while things like the mouse cursor and UI overlays work in screen space.

> [!WARNING] **Common Mistake**
>
> Avoid changing an object's actual position when the camera moves. Objects should keep their world positions, the camera only affects how those positions are transformed for rendering.

### Why This Matters for Input

Rendering isn't the only reason coordinate spaces matter. The mouse reports its position in screen space, but your enemies, tiles, and items all exist in world space. If the camera is at `(2800, 1200)`, a click at `(380, 260)` doesn't refer to world position `(380, 260)`, it refers to `(3180, 1460)`. This is the reverse of the conversion above: instead of subtracting the camera's position, we add it.

```text
Screen position + Camera position = World position
```

Later in the tutorial, we'll add two methods to our camera that handle both directions and continue to work once rotation and zoom are introduced:

```csharp
WorldToScreen(...)
ScreenToWorld(...)
```

> [!SUCCESS] **Takeaway**
> World space tells you where an object exists. Screen space tells you where that object appears.

For a camera that only moves, we could subtract its position from every object ourselves. But a useful camera also needs to rotate and zoom, and manually applying those operations to every sprite would quickly become tedious and error prone. Fortunately, MonoGame gives us a way to describe all of those transformations at once,  that's where **transformation matrices** come in.

---

## How Does SpriteBatch Know Where to Draw Everything?

We now know that world positions must eventually be converted into screen positions before anything can be drawn. That leaves one final question: **who performs that conversion?**

The answer is `SpriteBatch`. Every time you call:

```csharp
_spriteBatch.Draw(texture, player.Position, Color.White);
```

`SpriteBatch` has to decide where that sprite appears on the screen. Without a camera, that decision is trivial; if the player's position is `(380, 260)`, `SpriteBatch` draws it at `(380, 260)`.

As soon as you introduce a camera, that stops being true. Our player is at `(3180, 1460)` in the world, our camera is at `(2800, 1200)`, and we already know the player should appear on screen at `(380, 260)`. Somewhere between calling `Draw()` and the sprite appearing on screen, **that conversion has to happen**. The camera provides that conversion by telling the renderer how to translate world positions into screen positions.

`SpriteBatch` doesn't know anything about players, enemies, or tile maps. As far as it's concerned, everything is just a position that needs to be rendered. That means the same transformation can be applied to every sprite in your game. Instead of writing this for every category of object:

```csharp
foreach (var enemy in enemies)
{
    enemy.ScreenPosition = enemy.WorldPosition - camera.Position;
}

foreach (var tree in trees)
{
    tree.ScreenPosition = tree.WorldPosition - camera.Position;
}
```

We describe the transformation **once**, and let `SpriteBatch` apply it to every sprite it draws. That saves repetitive code and ensures rotation, zoom, and future camera features affect every sprite the same way.

> [!TIP] **Why this matters**
>
> Good rendering systems avoid making every object responsible for drawing itself differently. Instead, they provide a common transformation that every object passes through.

### Enter the Transformation Matrix

So how do we describe that transformation? MonoGame uses a type called `Matrix`. If you've never worked with matrices before, don't worry, you don't need to understand matrix mathematics to build an effective camera.

For this tutorial, it's enough to think of a transformation matrix as a **recipe**: it tells `SpriteBatch` where the camera is, how much the world is zoomed, how much it's rotated, and where it's looking. That recipe is shared by every sprite, which is why we pass it to `SpriteBatch.Begin()` instead of transforming each object ourselves.

> [!SUCCESS] **Takeaway**
> A transformation matrix isn't another object in your game. It's a reusable set of instructions that tells `SpriteBatch` how to convert world positions into screen positions.

In the next section, we'll finally start writing code by building our own `Camera2D` class. We'll begin by asking a deceptively simple question: **what information does a camera actually need to remember?**

---

## What Information Does a Camera Actually Need to Remember?

A camera doesn't own the player, the world, or any sprites. Its only responsibility is deciding **how the world should be viewed**, and that turns out to require surprisingly little information.

### Position

First, the camera needs to know **where it is**. If the camera moves from `(1000, 500)` to `(1400, 500)`, the world itself does not move; you're just looking at a different part of it.

### Rotation

Sometimes you want the player to see the world from a different angle. The camera itself doesn't rotate objects; it changes how the world is viewed, so it needs to remember its current rotation.

### Zoom

Zoom controls how much of the world fits inside the game window. A zoom of `2.0f` makes sprites appear larger, while `0.5f` shows more of the map at once.

### Origin

One final question remains: when the camera is at `(1000, 500)`, what point on the screen does that represent? Most 2D cameras use the **center of the screen**, so we'll store an **origin**: the point around which the camera rotates and zooms.

In a `1280 x 720` viewport, that center point is `(640, 360)`. If the camera's `Position` is the player's world position and the origin is `(640, 360)`, the player naturally appears in the middle of the screen.

### That's Really It

A basic 2D camera only needs to remember four pieces of information:

- Where it is.
- How much it's rotated.
- How much it's zoomed.
- Which point inside the viewport represents its position.

Features you can add later, such as camera shake and smooth following, are built on top of these same four values.

> [!SUCCESS] **Takeaway**
>
> A camera isn't complicated because it stores lots of information. It's powerful because a small amount of information affects **every sprite** that gets rendered.

Now that we've identified the data our camera needs, we're ready to build our `Camera2D` class.

---

## Building the Simplest Possible Camera

We know everything our camera needs to remember: a position, a rotation, a zoom level, and an origin. Let's start with the smallest possible camera class.

```csharp
public sealed class Camera2D
{
}
```

There's not much here yet, that's intentional. We'll build the class one piece at a time.
### Position

The camera needs a position so it knows which part of the world it should be looking at.

```csharp
private Vector2 _position;
```

This stores the camera's current position in **world space**. We use a `Vector2` because a 2D camera only needs X and Y.

### Rotation

Next, let's give the camera the ability to rotate.

```csharp
private float _rotation;
```

Rotation is stored in **radians**, like the rest of MonoGame. In practice, you'll usually set it with helpers like `MathHelper.ToRadians()`.

A rotation of `0` means the camera isn't rotated at all; positive values rotate the view clockwise, negative values counter-clockwise.

> [!TIP] **Why radians?**
>
> MonoGame uses radians throughout its math API because they're the unit expected by the underlying trigonometric functions, such as `MathF.Sin()` and `MathF.Cos()`.

### Zoom

Now let's add zoom.

```csharp
private float _zoom = 1.0f;
```

A zoom of `1.0` means *draw everything at its normal size*; `2.0` means twice as large; `0.5` means half size.

> [!SUCCESS] **Takeaway**
>
> A value of `1.0f` means "no zoom." Whenever possible, good defaults should represent the most common behavior.

### Origin

The final piece of information we need is the camera's origin.

```csharp
private Vector2 _origin;
```

The camera's position represents the point we're looking at, but we still need to decide where that point appears inside the game window. Usually that's the center of the viewport:

```text
Viewport.Width / 2
Viewport.Height / 2
```

### Looking at Our Camera So Far

After adding those four fields, our class looks like this:

```csharp
public sealed class Camera2D
{
    private Vector2 _position;
    private float _rotation;
    private float _zoom = 1.0f;
    private Vector2 _origin;
}
```

This class doesn't do anything yet, but it already models the four pieces of information the camera needs. Next, we need the transformation matrix that turns world coordinates into screen coordinates.

---

## Why Do We Need a Transformation Matrix?

Earlier, we converted a world position into a screen position with simple subtraction:

```text
World Position - Camera Position = Screen Position
```

If that's all a camera does, why do we need a transformation matrix at all? For a very simple camera, you don't. Suppose the player is at `(3180, 1460)` and the camera is at `(2800, 1200)`:

```csharp
Vector2 screenPosition = player.Position - camera.Position;
_spriteBatch.Draw(texture, screenPosition, Color.White);
```

That works perfectly if your camera only ever moves. The trouble starts once it needs to do more than translate.

### The Problem

Once the camera can zoom, every world position also needs to be scaled:

```csharp
Vector2 screenPosition = (player.Position - camera.Position) * camera.Zoom;
```

Still manageable. But once the camera can also rotate, every sprite in your scene needs the same translate/rotate/scale sequence. Without a shared transformation, that logic gets repeated everywhere.

### A Better Solution

Instead of asking every sprite to perform those calculations itself, we describe the transformation **once**: subtract the camera position, rotate, zoom, then convert to a screen position. MonoGame stores that description inside a **transformation matrix**, and `SpriteBatch` applies it automatically:

```csharp
_spriteBatch.Draw(texture, player.Position, Color.White);
```

We're no longer calculating screen positions ourselves. We give `SpriteBatch` the object's **world position** and let it perform the conversion.

> [!TIP] **Why this design is powerful**
>
> The camera doesn't know anything about players, enemies, or particle effects. It simply defines how **all world positions** should be transformed before rendering.

### A Transformation Matrix Is Just a Set of Instructions

If the word *matrix* sounds intimidating, don't worry, you don't need to understand the mathematics behind it to build an effective camera. For this tutorial, it's enough to think of a transformation matrix as a **set of instructions** that tells `SpriteBatch` how every world position should be viewed.

### What Does the Matrix Describe?

Our camera currently stores four pieces of information: position, rotation, zoom, and origin. The transformation matrix combines them into one description of **how the world should be rendered**. Because every sprite shares that result, we only need to rebuild it when the camera changes; we'll handle that with a **dirty flag**.

> [!TIP] **Good Design**
>
> Expensive values that depend on other state are often calculated only when needed, then reused until something changes. This pattern appears throughout game development, not just in camera systems.

In the next section, we'll add our first new fields to the `Camera2D` class and teach it how to build and cache its transformation matrix.

---

## Building and Caching the Transformation Matrix

In the previous section, we learned that the transformation matrix is simply a description of how the camera views the world. Our camera already stores everything needed to build that description, position, rotation, zoom, and origin. Now we need somewhere to store the finished matrix.

```csharp
private Matrix _transform;
```

This field will always contain the camera's most recently calculated transformation matrix. We're not calculating anything yet,  just giving the camera a place to store the result once it's built.

### When Should the Matrix Be Rebuilt?

It might seem reasonable to rebuild the matrix every frame, but if the camera hasn't changed, that would just repeat work. We only want to rebuild the matrix **when something changes**.

### Remembering When the Camera Changes

To do that, we introduce another field.

```csharp
private bool _isDirty = true;
```

In programming, **dirty** simply means "this value is out of date and needs to be recalculated." When `_isDirty` is `true`, one or more camera settings have changed since the matrix was last built. We initialize it to `true` because a brand new camera hasn't built its transformation matrix yet.

> [!TIP] **Why "dirty"?**
>
> "Dirty" is a common term across many game engines and UI frameworks. It usually means some cached data needs to be refreshed before it can be used again.

This technique is called **lazy evaluation**: instead of doing work as soon as something changes, we wait until the result is actually needed.

### Putting It Together

Our camera now contains six fields:

```csharp
public sealed class Camera2D
{
    private Vector2 _position;
    private float _rotation;
    private float _zoom = 1.0f;
    private Vector2 _origin;

    private Matrix _transform;
    private bool _isDirty = true;
}
```

We've separated two kinds of data: **camera state**, which describes how the camera should behave, and **cached state**, which stores the transformation derived from that state.

> [!SUCCESS] **Takeaway**
>
> The transformation matrix is derived from the camera's state. Instead of rebuilding it every frame, we'll cache it and only rebuild it when the camera changes.

The only thing missing now is the code that actually creates the transformation matrix.

---

## Building the Transformation Matrix

We've finally reached the point where our camera can do something useful. So far it only stores information; position, rotation, zoom, and origin. Now we need to turn those values into the transformation matrix `SpriteBatch` will use when rendering.

Instead of writing the entire matrix at once, we'll build it one step at a time, and by the end the complete transformation will make sense instead of feeling like something to memorize.

### Step 1: Move the World Relative to the Camera

Earlier in the tutorial, we converted world coordinates into screen coordinates by subtracting the camera's position:

```text
Screen Position = World Position - Camera Position
```

A translation matrix performs exactly the same operation.

```csharp
Matrix.CreateTranslation(-_position.X, -_position.Y, 0.0f);
```

Notice the negative values,  that often catches people the first time they see it.

The camera's position tells us where **the camera is**, but to make the camera appear to move right, we actually move the **entire world** left. If the camera moves 100 pixels right, every object must be rendered 100 pixels farther left. That's why we translate the world by the *negative* camera position.

As a quick check, imagine an object at world position `(500, 200)` and a camera at `(100, 0)`. After translation, the object appears at `(400, 200)` on screen. The object did not move in the world; the camera changed where it is seen.

At this point, our matrix only handles camera movement. If we stopped here, we'd already have a working scrolling camera.

### Step 2: Rotate the World

```csharp
Matrix.CreateTranslation(-_position.X, -_position.Y, 0.0f)
* Matrix.CreateRotationZ(_rotation)
```

We're not rotating the camera itself,  we're rotating the world around the camera's point of view. From the player's perspective the effect is identical: the camera appears to rotate, even though it's really the rendered world being transformed.

The important idea is that rotation happens around the camera's pivot, not around each sprite individually. Every world position is rotated by the same viewing rule, so the scene stays coherent.

### Step 3: Scale the World

Zoom works the same way. Rather than changing the size of every sprite individually, we scale the rendered world.

```csharp
Matrix.CreateTranslation(-_position.X, -_position.Y, 0.0f)
* Matrix.CreateRotationZ(_rotation)
* Matrix.CreateScale(_zoom)
```

A zoom value greater than `1.0` makes everything appear larger; a value less than `1.0` makes everything appear smaller. Nothing in the world actually changes size, only the rendered view changes.

### Something Still Looks Wrong

At this point our camera can move, rotate, and zoom, but if you try this implementation you'll notice something strange: rotation happens around the **top-left corner** of the screen, and zoom expands outward from that same corner. Most games rotate and zoom around the center of the viewport instead.

That's because every transformation we've applied so far has been performed relative to the screen's origin at `(0, 0)`,  the top-left corner. We need one final step.

### Step 4: Move the Camera's Origin

Earlier, we added an `_origin` field to our camera. Now we finally get to use it. After translating, rotating, and scaling the world, we perform one final translation.

```csharp
Matrix.CreateTranslation(-_position.X, -_position.Y, 0.0f)
* Matrix.CreateRotationZ(_rotation)
* Matrix.CreateScale(_zoom)
* Matrix.CreateTranslation(_origin.X, _origin.Y, 0.0f)
```

This last translation shifts everything so the camera's position appears at the center of the viewport rather than the top-left corner. Once it's applied, the player can remain centered on screen while the world moves around them.

Without this final step, the camera's current position would map to `(0, 0)`, the top-left corner of the window. If the origin is `(640, 360)`, the same camera position maps to the center of a `1280 x 720` viewport instead, which is usually the behavior we want.

### The Complete Transformation

Putting everything together gives us the complete transformation matrix.

```csharp
private void UpdateMatrix()
{
    _transform =
        Matrix.CreateTranslation(-_position.X, -_position.Y, 0.0f)
        * Matrix.CreateRotationZ(_rotation)
        * Matrix.CreateScale(_zoom)
        * Matrix.CreateTranslation(_origin.X, _origin.Y, 0.0f);

    _isDirty = false;
}
```

Read the code from top to bottom and it tells a story:

1. Move the world so the camera becomes the new reference point.
2. Rotate the world around the camera.
3. Scale the world to apply zoom.
4. Move everything into the viewport.

Once you think about the matrix this way, it stops being a mysterious formula and becomes simply a sequence of transformations that mirrors everything we've learned throughout this tutorial.

> [!SUCCESS] **Takeaway**
>
> A transformation matrix isn't magic. It's a sequence of operations applied in order:
>
> **Translate -> Rotate -> Scale -> Move into the viewport.**

Our camera can now build a complete transformation matrix that follows the camera's position, supports rotation and zoom, and keeps the camera centered in the viewport. The final step is making sure that matrix is rebuilt whenever the camera changes and automatically supplied to `SpriteBatch` when we begin drawing.

---

## Using the Camera with SpriteBatch

Our camera can now build a complete transformation matrix. The last step is simple: pass that matrix to `SpriteBatch.Begin()`.

```csharp
_spriteBatch.Begin(transformMatrix: camera.Transform);
DrawWorld();
_spriteBatch.End();
```

That's all it takes. Every sprite drawn between `Begin()` and `End()` is automatically transformed using the camera, and we still draw sprites using their **world positions**:

```csharp
_spriteBatch.Draw(playerTexture, player.Position, Color.White);
```

We no longer subtract the camera position, rotate anything, apply zoom, or convert coordinates ourselves; the camera handles that for us.

### Drawing the User Interface

There's one important exception, not everything in your game should move with the camera. Things like health bars, score counters, and menus are part of the user interface and should stay fixed on screen no matter where the camera moves. If the health bar were transformed by the camera, it would drift off the edge of the screen as the player walked around the world.

Instead, UI elements are drawn **without** the camera's transformation.

```csharp
// Draw the game world.
_spriteBatch.Begin(transformMatrix: camera.Transform);
DrawWorld();
_spriteBatch.End();

// Draw the user interface.
_spriteBatch.Begin();
DrawUserInterface();
_spriteBatch.End();
```

The first pass renders everything in world space. The second pass renders everything in screen space, because no transformation matrix is supplied, UI coordinates are interpreted directly as screen coordinates. If the player walks 200 pixels to the right, the map scrolls under the camera, but a health bar drawn at `(20, 20)` stays at `(20, 20)`.

> [!SUCCESS] **Takeaway**
>
> Objects don't move themselves into screen space, they exist in world space, and the camera transforms them during rendering.  UI elements are the exception, they're already in screen space and should be drawn without the camera.

Next, we'll add convenience methods such as `WorldToScreen()` and `ScreenToWorld()`, which are useful for mouse input, selection, and editor tools.

---

## Converting Between World Space and Screen Space

So far we've mostly converted from world space to screen space, which is what happens when `SpriteBatch` renders your game. But sometimes we need to go the other direction too.

Suppose the player clicks at mouse position `(420, 315)`. Those coordinates are relative to the game window, not the world, so we first need to convert them into world space. The opposite comes up too: if an enemy is standing at `(3400, 1800)` and we want to draw a floating health bar above its head, we need to convert that world position into screen space.

### Giving the Camera Two New Responsibilities

Rather than scattering coordinate conversion logic throughout our game, we can teach the camera how to perform these conversions.

```csharp
public Vector2 WorldToScreen(Vector2 worldPosition)
{
    // TODO
}

public Vector2 ScreenToWorld(Vector2 screenPosition)
{
    // TODO
}
```

Their names are intentionally descriptive. `WorldToScreen()` answers "where does this world position appear on screen?" `ScreenToWorld()` answers the opposite: "what world position exists beneath this screen coordinate?"

Earlier, converting between coordinate spaces only required adding or subtracting the camera's position. Now that our camera also supports rotation, zoom, and an origin, the transformation matrix contains everything we need.

> [!TIP] **A Nice Side Effect**
>
> By letting the camera perform these conversions, the rest of your game doesn't need to know how the camera works internally. If you later change how your camera is implemented, these methods continue to provide the same simple interface.

In the next section, we'll implement `WorldToScreen()` and `ScreenToWorld()` using the transformation matrix we've already built.

---

## Implementing `WorldToScreen()`

Earlier, we added this method to our camera:

```csharp
public Vector2 WorldToScreen(Vector2 worldPosition)
{
    // TODO
}
```

Its job is straightforward: given a position somewhere in the game world, it should tell us where that position appears inside the game window. If an enemy is standing at `(3180, 1460)` and the camera is currently looking at that part of the world, we'd expect it to appear on screen at `(380, 260)`.

The answer turns out to be surprisingly simple:

```csharp
public Vector2 WorldToScreen(Vector2 worldPosition)
{
    return Vector2.Transform(worldPosition, Transform);
}
```

That's the entire implementation. The transformation matrix already contains the instructions needed to convert a world position into a screen position; `Vector2.Transform()` just applies those instructions to a single point. This is useful anytime we need to know where something appears on screen without actually drawing it:

- Positioning a floating label over an enemy
- Placing a debug marker
- Connecting a world object to a screen space UI element.

In all of these cases, we already know the object's world position and just need to know where that position appears on the screen.

You could call `Vector2.Transform()` directly, but a dedicated `WorldToScreen()` method keeps the conversion owned by the camera.

If the camera's implementation ever changes, the rest of your game doesn't need to change with it. Instead of exposing *how* the conversion works, the camera exposes *what* it does. Compare these two lines:

```csharp
Vector2 screenPosition = Vector2.Transform(enemy.Position, camera.Transform);
```

```csharp
Vector2 screenPosition = camera.WorldToScreen(enemy.Position);
```

The second version communicates intent much more clearly.

> [!TIP] **Design Tip**
>
> Good APIs describe *what* they're doing, not *how* they're doing it. `WorldToScreen()` communicates intent; `Vector2.Transform()` communicates implementation.

Next, we'll reverse the process and convert from screen space back into world space — which lets us answer questions like which tile the player clicked, or where the mouse cursor is pointing in the world.

---

## Implementing `ScreenToWorld()`

Now we need to solve the opposite problem. Suppose the player clicks the mouse at `(420, 315)`, which are screen space coordinates. How do we determine where that click occurred in the game world?

At first this might seem harder, since the camera could be translated, rotated, zoomed, and centered on an arbitrary origin all at once. Trying to manually undo each of those transformations would quickly get complicated. Fortunately, we don't have to.

### Undoing a Transformation

We already built a matrix that converts world space positions into screen space. If that matrix converts world space into screen space, we just need something that performs the opposite conversion.  Mathematicians call this the **inverse**.

An inverse transformation reverses the effect of another transformation: if one moves a point from A to B, the inverse moves it from B back to A. That's exactly what we need.

### Creating the Inverse Matrix

MonoGame provides a method that calculates the inverse of a matrix.

```csharp
Matrix inverse = Matrix.Invert(Transform);
```

We didn't have to think about the camera's position, rotation, zoom, origin, or the order those transformations were applied in, the inverse matrix automatically reverses the entire transformation. Once we have it, converting a point is just as easy as before.

```csharp
public Vector2 ScreenToWorld(Vector2 screenPosition)
{
    Matrix inverse = Matrix.Invert(Transform);
    return Vector2.Transform(screenPosition, inverse);
}
```

That's the complete implementation. Just like `WorldToScreen()`, it only requires a single call to `Vector2.Transform()`, the only difference is which matrix we use.

### The Two Methods Together

Our camera now provides both directions of conversion.

```csharp
public Vector2 WorldToScreen(Vector2 worldPosition)
{
    return Vector2.Transform(worldPosition, Transform);
}

public Vector2 ScreenToWorld(Vector2 screenPosition)
{
    Matrix inverse = Matrix.Invert(Transform);
    return Vector2.Transform(screenPosition, inverse);
}
```

These two methods are mirror images of one another: one applies the camera's transformation matrix, the other applies its inverse.

> [!NOTE] **Notice the Symmetry**
>
> `WorldToScreen()` and `ScreenToWorld()` don't implement two different algorithms. They're really the same operation performed with two different matrices.
>
> [!SUCCESS] **Takeaway**
>
> Every transformation has an inverse.  If a transformation matrix converts world space into screen space, its inverse converts screen space back into world space. By using both, the camera becomes the single source of truth for every coordinate conversion in your game.

At this point, you have a complete `Camera2D` implementation and a foundation you can extend with features such as smooth movement, camera shake, bounds, or target-following.

---

## Complete `Camera2D` Class

We've built the camera one piece at a time. The complete implementation below brings those pieces together into a reusable `Camera2D` class.

The constructor uses the dimensions of the viewport to place the camera's origin at the center of the game window.

```csharp
public Camera2D(Viewport viewport)
{
    _origin = new Vector2(viewport.Width * 0.5f, viewport.Height * 0.5f);
}
```

The camera also exposes properties for changing its position, rotation, zoom, and origin. Whenever one of those values changes, the property marks the cached transformation matrix as dirty.

```csharp
public Vector2 Position
{
    get => _position;
    set
    {
        if (_position != value)
        {
            _position = value;
            _isDirty = true;
        }
    }
}
```

That ensures the matrix will be rebuilt the next time it is requested, but not before it is needed.

Here is the complete class:

```csharp
using System;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;

public sealed class Camera2D
{
    private Vector2 _position;
    private float _rotation;
    private float _zoom = 1.0f;
    private Vector2 _origin;

    private Matrix _transform;
    private bool _isDirty = true;

    public Camera2D(Viewport viewport)
    {
        _origin = new Vector2(viewport.Width * 0.5f, viewport.Height * 0.5f);
    }

    public Vector2 Position
    {
        get => _position;
        set
        {
            if (_position != value)
            {
                _position = value;
                _isDirty = true;
            }
        }
    }

    public float Rotation
    {
        get => _rotation;
        set
        {
            if (_rotation != value)
            {
                _rotation = value;
                _isDirty = true;
            }
        }
    }

    public float Zoom
    {
        get => _zoom;
        set
        {
            if (value <= 0.0f)
            {
                throw new ArgumentOutOfRangeException(nameof(value), "Zoom must be greater than zero.");
            }

            if (_zoom != value)
            {
                _zoom = value;
                _isDirty = true;
            }
        }
    }

    public Vector2 Origin
    {
        get => _origin;
        set
        {
            if (_origin != value)
            {
                _origin = value;
                _isDirty = true;
            }
        }
    }

    public Matrix Transform
    {
        get
        {
            if (_isDirty)
            {
                UpdateMatrix();
            }

            return _transform;
        }
    }

    public Vector2 WorldToScreen(Vector2 worldPosition)
    {
        return Vector2.Transform(worldPosition, Transform);
    }

    public Vector2 ScreenToWorld(Vector2 screenPosition)
    {
        Matrix inverse = Matrix.Invert(Transform);
        return Vector2.Transform(screenPosition, inverse);
    }

    private void UpdateMatrix()
    {
        _transform =
            Matrix.CreateTranslation(-_position.X, -_position.Y, 0.0f)
            * Matrix.CreateRotationZ(_rotation)
            * Matrix.CreateScale(_zoom)
            * Matrix.CreateTranslation(_origin.X, _origin.Y, 0.0f);

        _isDirty = false;
    }
}

```

The `Transform` property is where lazy evaluation happens. If the camera hasn't changed, it returns the matrix that was already calculated. If one of the camera's properties has changed, it calls `UpdateMatrix()` before returning the new matrix.

The `Zoom` property also prevents values less than or equal to zero. A zoom of zero would collapse the world to a single point and produce a transformation matrix that cannot be inverted by `ScreenToWorld()`.

### Creating the Camera

Create the camera after the graphics device has been initialized, such as inside `LoadContent()`:

```csharp
private Camera2D _camera = null!;

protected override void LoadContent()
{
    _spriteBatch = new SpriteBatch(GraphicsDevice);
    _camera = new Camera2D(GraphicsDevice.Viewport);
}
```

The camera's origin will initially be placed at the center of the viewport.

You can then move, rotate, or zoom the camera by changing its properties:

```csharp
_camera.Position = player.Position;
_camera.Rotation = MathHelper.ToRadians(10.0f);
_camera.Zoom = 1.5f;
```

Because the camera's position is mapped to its origin, assigning the player's world position to `Position` places the player at the center of the viewport by default.

Finally, pass the camera's transformation matrix to `SpriteBatch.Begin()` when drawing the world:

```csharp
protected override void Draw(GameTime gameTime)
{
    GraphicsDevice.Clear(Color.CornflowerBlue);

    _spriteBatch.Begin(transformMatrix: _camera.Transform);
    DrawWorld();
    _spriteBatch.End();

    _spriteBatch.Begin();
    DrawUserInterface();
    _spriteBatch.End();

    base.Draw(gameTime);
}
```

Everything drawn during the first pass uses world coordinates and is transformed through the camera. Everything drawn during the second pass uses screen coordinates and remains fixed inside the game window.

> [!NOTE] **Handling Window Resizing**
>
> The camera's origin is calculated from the viewport size when the camera is created. If your game allows the window or rendering resolution to change, update the origin afterward:
>
> ```csharp
> _camera.Origin = new Vector2(
>     GraphicsDevice.Viewport.Width * 0.5f,
>     GraphicsDevice.Viewport.Height * 0.5f);
> ```

> [!SUCCESS] **Takeaway**
>
> The completed camera has a small responsibility: it stores how the world should be viewed and produces the transformation needed to create that view.
>
> Game objects remain in world space, `SpriteBatch` performs the rendering, and the camera provides the bridge between them.
