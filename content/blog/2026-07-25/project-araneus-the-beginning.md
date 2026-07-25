---
title: "Project Araneus: The Beginning"
description: The first day of Project Araneus
date: 2026-07-25
time: 01:58 AM
---
# Project Araneus: The Beginning

Tonight was my first night working on Project Araneus, and it ended up being more about finding the right seams than writing a pile of rendering code.

When I sat down, I already knew the work was going to live on the native side.  MonoGame did not have the backend I wanted for this path there, so most of the renderer bring up needed to happen there.

What I did not know yet was exactly where the first integration seam would show up once the backend existed.

After tracing the path more carefully, the interesting surprise was that the managed native layer was not really a problem.  It was already pretty backend agnostic.  That kept me from wandering into managed changes I didn't actually need and let me stay focused on bringing up the backend itself.

With that sorted out, I finally started putting together the native backed itself.

At this stage I wasn't trying to render triangle or get effects working.  I just wanted the backend to own the basics: creating the graphics context, managing the device lifetime, clearing the framebuffer, presenting, and handling viewport and scissor state.

That first slice is in now.

One thing I did intentionally was leave everything else as explicit traps.  If textures, shaders, render target, or effects aren't implemented yet, I don't want the code quietly falling back to an older managed path and giving the impression that more of the renderer is working than actually is.  I'd much rather have it fail loudly until each piece is genuinely implemented.

While I was working through that, I also got confirmation on the desktop compatibility target I had in mind.  The short version was that I did not need to bend over backwards for very old compatibility profiles.  That was reassuring because it matched the direction I was already heading.  Supporting older profiles would just add complexity for very little benefit, so the backend can be written around a more modern core profile baseline from the beginning.

One thing that surprised me was where the actual seam between managed and native ended up being.

I kept thinking, "Where does the managed code decide which backend this is?"

The answer is..it mostly doesn't.

It's one of those details that's easy to miss if you start by reading rendering code instead of following the application's startup path.

After that, I moved into buffer support, and that's where Project Araneus started making me stop and think again.

The first question wasn't actually about vertex buffers or index buffers. It was about function loading.

Once I got into buffer work, I ran into the usual Windows function-loading issue for newer graphics API calls. That pushed me into writing a tiny local loader instead of pulling in another dependency. My first though was whether I should pull in a dedicated loader library. Instead, I checked what was already in the repository.

SDL already ships the typedefs for the extension functions I needed, and it already exposes the runtime lookup mechanism.  That turned out to be everything I needed for now.  Rather than adding another dependency just to load a relatively small set of functions, I wrote a tiny loader inside the backend that only grabs the entry points the renderer actually uses.

That feels like the right balance at this stage.  If the backend grows enough that it becomes painful to maintain, I can always revisit it later.

Another small detail that I almost overlooked was one of the default state objects required by the core profile I chose.

Coming from older compatibility style APIs, it's easy to forget about because you rarely had to think about it.  In a modern core profile, though, having that object created and bound is not optional.  Before anything else can draw cleanly, the backend needs a valid one.

It's not exactly exciting code, but it's one of those foundational pieces that's much easier to get right now than after everything else has been build on top of it.

By the end of the night, the backend had moved past simply trapping every buffer call.

It now owns actual native buffer objects, tracks bound vertex and index buffer, uploads data through `SetData`, supports `GetData` using CPU-side shadow copies, and exposes real `Draw` and `DrawIndexed` entry points on the native side.

The shadow copy is a good example of trying  not to get ahead of myself.  Could I implement property GPU readback? Probably.  Do I need it right now? Not really.

`GetData` needs to behave correctly, and keeping a CPU copy is a straightforward way to make that happen while I'm still trying to bring the renderer up.  I can always revisit that decision later if it becomes a measurable problem.

That doesn't mean Project Araneus is ready to draw a real sample yeet.

The next wall is pretty obvious now.  As soon as `ApplyState(true)` gets far enough, it starts needing shaders, input layouts, constant buffers, textures, and samplers.  Buffers were really just the first layer of the renderer.  The next layer is where things get considerably more interesting.

Overall, I'm pretty happy with where things ended up tonight.

I cam away with a better understanding of the native architecture, a proper runtime path for Project Araneus, a backend that owns its own context and buffers, and a much clearer picture of what the next layer of work needs to be.

Next will probably be textures, samplers ,and whatever surprises shader binding decides to throw at me.