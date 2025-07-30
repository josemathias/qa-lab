# QA Lab

This repository demonstrates a multi-layered QA testing strategy, including:

- **L0**: Unit tests using Jest
- **L1**: Integration tests using Cypress
- **L2**: Mobile/browser automation using Appium
- **L3**: Load testing using k6
- **CI**: GitHub Actions workflow for L0 and L1 tests

---

## How to run tests

- Unit tests: `cd L0-unit-tests && npm install && npm test`
- Cypress tests: `cd L1-integration-tests && npm install && npm test`
- Appium test: `cd L2-api-mobile-tests/appium && node basic-appium-test.js`
- k6 test: `cd L3-performance-security/k6 && k6 run sample-load-test.js`