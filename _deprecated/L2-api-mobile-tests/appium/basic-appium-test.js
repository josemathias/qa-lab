const wd = require("wd");

async function runTest() {
  const driver = wd.promiseRemote("http://localhost:4723/wd/hub");

  const desiredCaps = {
    platformName: "Android",
    deviceName: "emulator-5554",
    browserName: "Chrome"
  };

  await driver.init(desiredCaps);
  await driver.get("https://example.com");
  const title = await driver.title();
  console.log("Page title is:", title);

  await driver.quit();
}

runTest().catch(console.error);