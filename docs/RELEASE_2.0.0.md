# Rostam 2.0.0

Session workouts add optional gym-style tracking alongside individual sets and timed activities.

## Workouts

Use the Plus menu to start a workout. Today starts a live workout; choosing a past date opens workout details so the completed workout is recorded on that date. Add exercises from the existing library, save sets with the completion checkbox, reorder exercises, and finish when done. Suggested values remain unsaved until confirmed. Start/end and set times use the server-configured timezone.

There is one active workout at a time. Starting again opens that workout. Saved exercises, ordering, and sets survive refreshes and app restarts; use its Resume card to continue. A resume banner also appears when viewing another date. Unsaved input stays only on the current screen and is never stored or queued offline.

Workouts have their own cards on the day ledger. Individual exercise cards contain standalone sets only. Exercise history, previous-set suggestions, and exercise recommendations include both kinds of sets. Session sets do not enroll in, advance, or resolve daily rotations, and do not enter rotation lookback suggestions.

Completed workouts and sets can be corrected later. Their timestamps must remain within the workout's interval and cannot be in the future. Workout cards appear on the start date and on additional dates containing their sets. Cross-midnight workouts retain the actual occurrence date of each set. Local times skipped or repeated by daylight saving transitions require an unambiguous time; the API also accepts explicit offsets.

Finishing a live workout requires at least one saved set. Empty workouts can be discarded. Deleting a populated workout or removing a populated exercise requires confirmation and deletes its sets. Archived exercises keep their saved history editable; restore them before adding sets. Remove workout references before permanently deleting an exercise definition.

## Calendar

A green dot means at least one saved exercise set or logged activity exists on that date. A workout qualifies after its first saved set, without waiting for Finish. Empty workouts, exercise definitions, routines, photos, notes, and measurements do not qualify. Activity entries qualify while in progress and mark their local start date. Deleting the final qualifying record removes the dot. Future dates remain unmarked.

## Upgrade and interfaces

App and API versions are 2.0.0. SQLite migration 17 adds workouts and ordered exercise membership; existing exercise sets remain standalone, with no history conversion. Stored workout sets use the existing set table, avoiding duplicate records. Earlier supported backups migrate during restore; new backups include workout data. As usual, restoring a backup creates a safety snapshot. Do not run version 1 against a migrated database; restore a pre-upgrade backup if rolling back.

New API routes cover workout creation, bounded listing (`limit`, `beforeId`), active-workout lookup, detail updates/deletion, finishing, exercise membership/order, and set creation. Day responses add `workouts` and `activeWorkout`. Set writes accept `occurredAt` for workout sets; offset-free date-times use the configured server timezone. Standalone writes retain their existing `time` field. Persistent drafts and offline writes are not supported.

Reusable routines and rest timers are deferred. Supersets are excluded.
