---
title: "Project Araneus: The Next Layer"
description: The next layer of Project Araneus
date: 2026-07-26
time: 11:40 PM
---

# Project Araneus: The Next Layer

Last time I got the renderer far enough to create a context, own its buffers, and make it all the way to draw submission. That was enough to prove the plumbing worked.

This fell apart as soon as I introduced a real image.

Creating the renderer wasn't the difficult part. The moment the framework tried to bind image data and everything that comes along with it, the whole path hit a wall.

So this pass ended up being less about drawing and more about resource ownership.

I wanted to keep the scope pretty tight. "Resource support" can explode into a long list of formats, edge cases, and special handling if you're not careful, and that wasn't really the goal yet. I just wanted one solid path that could own image resources correctly from end to end. Everything else can come later.

That's where most of the work went.

The backend now owns image resources on the native side. It can accept uploads, hand data back out again, and keep track of the state objects that describe how those resources should be used.

Saying it like that makes it sound almost boring.

Actually getting there meant touching several different seams at once: creation, binding, data movement, lifetime, and deciding what state really belongs to a resource versus what should stay with the device.

That last question ended up taking more thought than I expected.

It's surprisingly easy to make something like this "work" by scattering state changes wherever they're convenient. I could have done that.

I didn't really want to inherit that debugging session six months from now.

Instead, I tried to keep the ownership in one place so later work has somewhere obvious to build from instead of becoming a trail of "why did changing this binding break something over there?"

A couple of smaller details also showed up along the way.

One was format handling. Data that looks simple on the managed side isn't always represented the same way once it crosses into the native renderer. Rather than pretending the first implementation could handle everything, I was pretty explicit about what it supports today.

The other came from looking back through some of the existing code. One reload path was passing a size value in a way that wasn't quite what the native side expected.

Nothing was actually broken.

It looked exactly like the sort of mismatch that quietly survives for months before somebody loses an afternoon trying to figure out why two pieces of code disagree. Since I was already in there, I normalized it.

Project Araneus is another layer deeper now.

It still isn't ready for a real sample, but it also doesn't stop the first time image data enters the picture. That was one of the last obvious holes in the foundation.

The problems from here aren't really about resource ownership anymore.

They're about execution.

Once the remaining binding and state paths come online, the renderer stops being a collection of individual pieces and starts proving whether those pieces actually work together.

That's the part I'm looking forward to.