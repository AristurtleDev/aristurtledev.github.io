---
title: "Project Araneus: From Bring Up to Parity"
description: Project Araneus moves from a simple backend proof to parity and visual validation.
date: 2026-07-31
time: 1:33 PM
---

# Project Araneus: From Bring Up to Parity

I missed out on a few dev notes this past week.  As I worked through different sections, I was writing notes down and realized that it would be better to do them all as a single note.

I split them up initially because each session I worked had a clear goal, so it made sense at the time. One night I was working on render targets and offscreen ownership, the next was state behavior, then execution, and removing CPU shadow copies.  Some of it was refactoring code that helped me get the backend off the ground quickly but no longer made sense to be something to depend on in the long term.

At the time, all of those felt like separate milestones.  Now they feel more like one long bring up.

The project's backend had to stop being a collection systems that worked in isolation and needed to start acting like an actual backend.  That's how I was structuring the earlier posts and that was, in a way, structuring how I completed the work.

Once I was confident I could create resources, apply states, and execute effects, the question changed from "can this backend draw anything? to "does it behave like expected?".  Getting pixels on the screen proves the backend exists, matching years of behavior that other parts already rely on is a different story.

> Close enough isn't actually close enough.

That's where my focus began to shift.

Most of my work this week was less to do with adding features and more to do with auditing what I had already written.  This was simple enough to do, MonoGame has sample projects, Simon has the XNA Archive samples, why not make use of them to validate what I have now.

As I was running different samples, one question kept coming back to me:

"Where am i inventing behavior instead of carrying over behavior that already exists".  Some of those answers, however, were not what I wanted to find.

There are some specific fixes that made an individual sample render correctly, but then made me question why that fix was ever needed in the first place. There wre some places, such as constant buffer handling and effect execution, that worked for cases I had tested, but were not behaving the same way as the existing backends.  I also found a couple of managed side changes that solved problems, but would leak concerns into existing code that Vulkan and DX12 hare.  Those could not stay.

As I worked through these fixes for samples, one thing became very clear, if something is a backend specific behavior, it needs to stay backend specific.  In other words, if something only exists because a certain backend behaves a certain way, then that backend should own it. It shouldn't hide behind a capability flag or some managed work around.  That ended up changing a few seams I had already written.

Validation became a much larger part of the work toward the end of the week.  Initially I could reason through problems just reading the code.  As it got more complex, that stopped being enough.  I needed to see the current rendering and the project's rendering side by side doing the same thing.  This is where the existing samples really paid off.

Once i was happier with the comparisons, i wanted something closer to a real game.  THe NeonShooter sample was a really good fit for this.  It gave me a controlled test environment that exercised more combinations of assets and state changes than my validation scene could. 

For a while, I was thinking the remaining issues were just polish.  That's when i decided to put together a small skybox and environment mapping sample.  Cubemaps, i feel, are one of those things that are much easier to validate by moving a camera around than just staring at code.  Mistakes tend to become glaringly obviously pretty quickly when you can actually interact with the scene.  That's when  started chasing a cube that wasn't rendering correctly.  That one cube, that silly little cube.  It lead me back through paths I thought were solid.  Vertex handling, index handling, constant buffer uploads, effect application order, state transitions, and a few short cuts I had taken to get the backend off the ground quickly but forgot to revisit.

I'm glad it happened.  It was frustrating, but looking back I'd rather have a validation sample prove me wrong than to convince myself otherwise. It was more work than I wanted it to be, but that little cube saved the day.  A broken validation sample is a lot easier to fix than a backend you've convinced yourself is correct. 

So, the biggest changes this week weren't really technical. It was realizing that the project has moved into a different phase.  Early bring up proved the system could exist, now everything thing that is mismatch matters.  Every seam between the managed and native side needs to live in the right place.  Every validation needs to become part of the implementation instead of something I build after.  A couple of weeks ago, progress meant making another system come online.  Now progress means discovering where things disagree about something subtle, figuring out why, and deciding which one is correct.

That's much slower work.  If I were to be honest, that's also the work i was looking forward to the most from the beginning. It's no longer a question of can it render anymore, it's a question of whether it can be trusted.

![Skybox Demo in Project Araneus](output.webm)

> [!NOTE] **Asset Attribution**
> This demonstration video contains texture assets from the LearnOpenGL "Cubemaps" tutorial by Joey de Vries.  
> Original tutorial: [https://learnopengl.com/Advanced-OpenGL/Cubemaps](https://learnopengl.com/Advanced-OpenGL/Cubemaps).  
> Assets are licensed under CC BY 4.0: [https://creativecommons.org/licenses/by/4.0/](https://creativecommons.org/licenses/by/4.0/)  
> © Joey de Vries. X: [@JoeyDeVriez](https://twitter.com/JoeyDeVriez)