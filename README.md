# Send AtCoder Contests to Discord

Google Apps Script (GAS) notifier for upcoming AtCoder contests using a Discord webhook.

Supports **all contests** in the [AtCoder upcoming contest list](https://atcoder.jp/contests/), including ABC, ARC, AGC, AHC, and sponsored contests. No AtCoder account or API key is required.

## Features

- Notify when a future contest first appears in the upcoming list.
- Notify on the day a contest starts.
- Notify once when a contest is within 120 minutes of starting.
- Prevent repeated notifications using Google Apps Script Properties Service.
- Run automatically with an hourly time-driven trigger.
- Filter contest series by ID prefix, or leave the filter empty to include everything.
- First execution seeds existing upcoming contests without generating a flood of new-contest announcements.

## Setup

1. Open [Google Apps Script](https://script.google.com/) and create a project.
2. Copy [code.gs](code.gs) into the script editor.
3. Create a Discord webhook for your preferred channel.
4. Replace `YOUR_DISCORD_WEBHOOK_URL` in `CONFIG.WEBHOOK_URL` in your **private GAS deployment**. Never commit an actual webhook URL to this public repository.
5. Run `checkAtCoderContests` manually once and grant the requested permissions. The first run records currently listed contests without sending messages.
6. In Apps Script, open **Triggers** (clock icon) → **Add Trigger**. Choose `checkAtCoderContests`, **Time-driven**, **Hour timer**, **Every hour**.
7. View **Executions** to confirm successful runs. GAS hourly triggers are not guaranteed to run at an exact minute.

You can leave the trigger disabled until you want to resume following contests.

## Configuration

| Field | Default | Description |
| --- | --- | --- |
| `WEBHOOK_URL` | Placeholder | Discord webhook URL. Set privately. |
| `ATCODER_URL` | AtCoder present contests | Official upcoming-contest source. |
| `TIMEZONE` | `Asia/Tokyo` | Date formatting and day-of-contest comparison. |
| `REMINDER_MINUTES` | `120` | How early a reminder can be sent. |
| `CONTEST_PREFIXES` | `[]` | Empty means all. For ABC/ARC/AGC/AHC only, use `["abc", "arc", "agc", "ahc"]`. |

A contest whose name is sponsored may still have an `abc...` or `ahc...` ID. Filtering uses IDs rather than title text.

## Notification behavior

The script checks future contests and records three independent flags per contest ID: new announcement, contest-day notice, and pre-start reminder. It saves each flag after Discord successfully accepts the corresponding message.

The first run only initializes the new-announcement flag for currently listed contests. Day-of and pre-start notifications are still enabled on later runs. Running the script more frequently does not intentionally resend completed notifications.

**Caveats:** This script parses AtCoder's public HTML, so changes to the site's markup can require updates. A delayed hourly trigger may miss the 120-minute reminder window. Google Apps Script execution limits and AtCoder access policies still apply. If Discord accepts a message and GAS stops before saving the flag, that message could be sent again on a later run.

## Troubleshooting

- `Upcoming contest table not found`: the HTML structure may have changed.
- `Set CONFIG.WEBHOOK_URL`: replace the placeholder only in your private Apps Script copy.
- Discord HTTP 4xx/5xx: check the webhook and request rate limits.
- To clear notification history, run `resetNotificationState`; the next run initializes state again.

## License

MIT.
