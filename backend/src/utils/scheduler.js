const cron = require("node-cron");
const nodemailer = require("nodemailer");
const prisma = require("../utils/prisma");
const { syncUser } = require("../services/userService");

// ─── Email transporter ────────────────────────────────────────────────────────

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendReminderEmail(to, contestName, startsAt) {
  const timeStr = new Date(startsAt).toUTCString();
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `⏰ Contest Reminder: ${contestName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: auto;">
        <h2 style="color: #3b82f6;">CFCompanion Reminder</h2>
        <p>Your contest is starting soon!</p>
        <h3>${contestName}</h3>
        <p><strong>Start time:</strong> ${timeStr}</p>
        <a href="https://codeforces.com/contests" 
           style="display:inline-block;padding:10px 20px;background:#3b82f6;color:white;border-radius:6px;text-decoration:none;">
          Go to Codeforces
        </a>
        <p style="color:#888;font-size:12px;margin-top:20px;">
          You subscribed to this reminder on CFCompanion.
        </p>
      </div>
    `,
  });
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

/**
 * Daily sync: refresh all user stats from CF API.
 * Runs every day at 3:00 AM UTC (avoids peak hours).
 * Staggered 2s between each user to respect CF rate limits.
 */
function startDailySync() {
  cron.schedule("0 3 * * *", async () => {
    console.log("[CRON] Starting daily user sync...");
    const users = await prisma.user.findMany({ select: { id: true, cfHandle: true } });

    for (const user of users) {
      try {
        await syncUser(user.id, user.cfHandle);
        console.log(`[CRON] Synced ${user.cfHandle}`);
      } catch (err) {
        console.error(`[CRON] Failed to sync ${user.cfHandle}: ${err.message}`);
      }
      // 2s gap between users to respect CF API rate limit
      await new Promise((r) => setTimeout(r, 2000));
    }

    console.log("[CRON] Daily sync complete.");
  });
}

/**
 * Contest reminder: check every 15 minutes for upcoming contests
 * and send emails 1 hour before start.
 */
function startContestReminders() {
  cron.schedule("*/15 * * * *", async () => {
    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);

    // Find reminders where contest starts within the next hour
    // and hasn't been sent yet
    const due = await prisma.contestReminder.findMany({
      where: {
        reminded: false,
        startsAt: {
          gte: fifteenMinutesAgo,
          lte: oneHourLater,
        },
      },
      include: {
        user: { select: { email: true, cfHandle: true } },
      },
    });

    for (const reminder of due) {
      if (!reminder.user.email) continue;
      try {
        await sendReminderEmail(reminder.user.email, reminder.cfContestName, reminder.startsAt);
        await prisma.contestReminder.update({
          where: { id: reminder.id },
          data: { reminded: true },
        });
        console.log(`[CRON] Sent reminder to ${reminder.user.email} for ${reminder.cfContestName}`);
      } catch (err) {
        console.error(`[CRON] Failed to send reminder: ${err.message}`);
      }
    }
  });
}

function startAllJobs() {
  startDailySync();
  startContestReminders();
  console.log("[CRON] All scheduled jobs started.");
}

module.exports = { startAllJobs };
