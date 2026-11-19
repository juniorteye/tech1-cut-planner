// Putting the planner on a phone as an app: the manifest and icons a phone needs,
// Chrome's own installability check, the "Install" card on Android, the Share
// steps on iPhone, and that the card stays away once hidden or installed.
// Run with: npm run test:install
//
// Like the other journeys it uses a throwaway workshop on the live database
// and removes it afterwards.
import { mkdirSync } from "node:fs";
import { chromium, devices } from "playwright";
import {
  BASE,
  OUTPUT,
  PHONE,
  addLogin,
  admin,
  check,
  checkEqual,
  checkEverySize,
  created,
  finish,
  logIn,
  newPage,
  newPassword,
  pageErrors,
  prepareOutput,
  section,
  snapshotOtherWorkshops,
  startServer,
  waitForServer,
} from "./harness.mjs";

prepareOutput("e2e/output/install");
mkdirSync(`${OUTPUT}/sizes`, { recursive: true });
const before = await snapshotOtherWorkshops();
const browser = await chromium.launch();
startServer();
await waitForServer(true);

const pngSize = (bytes) => [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
const card = (page) => page.getByRole("region", { name: "Install the app" });

// Chrome hands the page this event when it is ready to install. A test browser
// never does, so it is sent by hand, with a prompt that records being opened.
async function offerInstall(page, outcome) {
  await page.evaluate((outcome) => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    event.prompt = async () => { window.promptOpened = true; };
    event.userChoice = Promise.resolve({ outcome });
    window.dispatchEvent(event);
  }, outcome);
}

try {
  await section("A phone can read the app's details without logging in", async () => {
    const response = await fetch(`${BASE}/manifest.webmanifest`, { redirect: "manual" });
    checkEqual("the manifest opens without a login", response.status, 200);
    const manifest = await response.json();
    checkEqual("the app is called Tech1 Cut Planner", manifest.name, "Tech1 Cut Planner");
    checkEqual("the name under the icon fits", manifest.short_name, "Tech1 Cuts");
    checkEqual("it opens without the browser bar", manifest.display, "standalone");
    checkEqual("it opens on the jobs list", manifest.start_url, "/");
    for (const icon of manifest.icons) {
      const image = await fetch(`${BASE}${icon.src}`, { redirect: "manual" });
      const bytes = Buffer.from(await image.arrayBuffer());
      check(`${icon.src} opens without a login`, image.status === 200 && image.headers.get("content-type") === "image/png");
      checkEqual(`${icon.src} is the size it says`, pngSize(bytes).join("x"), icon.sizes);
    }
    check("there is a maskable icon for Android", manifest.icons.some((icon) => icon.purpose === "maskable"));

    const login = await (await fetch(`${BASE}/login`)).text();
    check("pages point to the manifest", login.includes('rel="manifest" href="/manifest.webmanifest'));
    check("iPhones open it full screen", /name="mobile-web-app-capable" content="yes"|name="apple-mobile-web-app-capable" content="yes"/.test(login));
    check("iPhones use the short name", login.includes('name="apple-mobile-web-app-title" content="Tech1 Cuts"'));
  });

  const owner = await addLogin("install-owner", newPassword());
  const setup = await newPage(browser, PHONE);
  await logIn(setup, owner);
  await setup.waitForURL("**/welcome");
  await setup.fill("input[name=name]", "Client Test Workshop Install");
  await setup.getByRole("button", { name: "Continue" }).click();
  await setup.waitForURL("**/setup");
  const { data: member } = await admin.from("workshop_members").select("workshop_id").eq("user_id", owner.id).single();
  created.workshops.push(member.workshop_id);
  const loggedIn = await setup.context().storageState();

  await section("Chrome agrees it can be installed", async () => {
    await setup.goto(`${BASE}/`);
    await setup.evaluate(() => navigator.serviceWorker.ready);
    const cdp = await setup.context().newCDPSession(setup);
    const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
    check("no installability errors", installabilityErrors.length === 0, JSON.stringify(installabilityErrors));
    const { url, errors } = await cdp.send("Page.getAppManifest");
    check("Chrome reads the manifest without errors", url.endsWith("/manifest.webmanifest") && errors.length === 0, JSON.stringify(errors));
  });

  await section("Android: an Install button, and the card goes once installed", async () => {
    const android = await newPage(browser, { ...devices["Pixel 7"], storageState: loggedIn });
    await android.goto(`${BASE}/`);
    await android.waitForLoadState("networkidle");
    check("no card before Chrome offers to install", (await card(android).count()) === 0);
    await offerInstall(android, "accepted");
    await card(android).getByRole("button", { name: "Install" }).click();
    check("Install opens Chrome's install box", await android.evaluate(() => window.promptOpened === true));
    await card(android).waitFor({ state: "detached" });
    check("the card goes after installing", true);
  });

  await section("Android: Not now keeps it away", async () => {
    const android = await newPage(browser, { ...devices["Pixel 7"], storageState: loggedIn });
    await android.goto(`${BASE}/`);
    await android.waitForLoadState("networkidle");
    await offerInstall(android, "dismissed");
    await card(android).getByRole("button", { name: "Not now" }).click();
    check("the card goes", (await card(android).count()) === 0);
    await android.reload();
    await android.waitForLoadState("networkidle");
    await offerInstall(android, "dismissed");
    await android.waitForTimeout(300);
    check("it does not come back on the next visit", (await card(android).count()) === 0);
  });

  await section("iPhone: the Share steps, and Got it hides them", async () => {
    const iphone = await newPage(browser, { ...devices["iPhone 13"], storageState: loggedIn });
    await iphone.goto(`${BASE}/`);
    const text = await card(iphone).innerText();
    check("it says to tap Share, then Add to Home Screen", /Tap\s+Share, then Add to Home Screen/.test(text), text);
    check("there is no Install button Apple would not honour", (await card(iphone).getByRole("button", { name: "Install" }).count()) === 0);
    await checkEverySize(iphone, "the jobs list with the install card", async () => {
      await iphone.goto(`${BASE}/`);
      await card(iphone).waitFor();
    });
    await card(iphone).getByRole("button", { name: "Got it" }).click();
    await iphone.goto(`${BASE}/setup`);
    await iphone.waitForLoadState("networkidle");
    check("it stays hidden on other pages", (await card(iphone).count()) === 0);
  });

  await section("Opened from the home screen: no card", async () => {
    const installed = await newPage(browser, { ...devices["iPhone 13"], storageState: loggedIn });
    await installed.addInitScript(() => Object.defineProperty(navigator, "standalone", { get: () => true }));
    await installed.goto(`${BASE}/`);
    await installed.waitForLoadState("networkidle");
    check("an installed iPhone app shows no card", (await card(installed).count()) === 0);

    const laptop = await newPage(browser, { viewport: { width: 1280, height: 800 }, storageState: loggedIn });
    await laptop.goto(`${BASE}/`);
    await laptop.waitForLoadState("networkidle");
    check("a computer that is not offered an install shows no card", (await card(laptop).count()) === 0);
  });

  await section("Nothing went wrong behind the scenes", async () => {
    check("no browser errors on any screen", pageErrors.length === 0, [...new Set(pageErrors)].map((t) => t.slice(0, 220)).slice(0, 6).join("\n      "));
  });
} finally {
  await finish(browser, before);
}
