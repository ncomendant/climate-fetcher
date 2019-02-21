const {Builder, By, Key, until} = require('selenium-webdriver');
const fs = require("fs");

  const url = "https://www.ncdc.noaa.gov/cdo-web/datatools/normals";
  const timeoutInterval = 10000;
  let driver = null;

  async function run() {
    driver = await new Builder().forBrowser('chrome').build();
    await resume(0, 0);
  }

  async function resume(locationIndex, stationIndex) {
    let i = locationIndex;
    let j = stationIndex;
    try {
      await driver.get(url);
      const loadingOverlay = await getLoadingOverlay();
      await driver.wait(until.elementIsNotVisible(loadingOverlay), timeoutInterval);
      const locations = await getLocationOptions();
      while (i < locations.length) {
        const location = locations[i];
        const stations = await getStationOptions(location, loadingOverlay);
        while (j < stations.length) {
          const station = stations[j];
          const detailsTable = await getDetailsTable(station, loadingOverlay);
          const stationData = await parseStationData(location, station, detailsTable);
          await logStationData(stationData);
          j++;
        }
        j = 0;
        i++;
      }
    } catch(e) {
      console.log(`${i} ${j}`);
      throw new Error(e);
    } finally {
      await driver.quit();
    }
  }

  async function log(path, data) {
    return new Promise((resolve, reject) => {
      fs.appendFile(path, data, 'utf8', () => {
        resolve();
      });
    });
  }


  async function logStationData(stationData) {
    const location = stationData.location;
    const station = stationData.station;
    const precipField = (stationData.precip) ? stationData.precip.join(",") : "";
    const minTempField = (stationData.minTemp) ? stationData.minTemp.join(",") : "";
    const avgTempField = (stationData.avgTemp) ? stationData.avgTemp.join(",") : "";
    const maxTempField = (stationData.maxTemp) ? stationData.maxTemp.join(",") : "";
    await log("log.txt", `${location}\t${station}\t${precipField}\t${minTempField}\t${avgTempField}\t${maxTempField}\n`);
  }

  async function getLoadingOverlay() {
    const loadingOverlay = await driver.findElement(By.css(".loadingOverlay"));
    return loadingOverlay;
  }

  async function getLocationOptions() {
    const locationSelect = await driver.findElement(By.css(".locationSelect"));
    const locationOptions = await locationSelect.findElements(By.css("option"));
    return locationOptions;
  }

  async function getStationOptions(locationOption, loadingOverlay) {
    await locationOption.click();
    await driver.wait(until.elementIsNotVisible(loadingOverlay), timeoutInterval);
    const stationSelect = await driver.findElement(By.css(".stationSelect"));
    const stationOptions = await stationSelect.findElements(By.css("option"));
    return stationOptions;
  }

  async function getDetailsTable(stationOption, loadingOverlay) {
    await stationOption.click();
    await driver.wait(until.elementIsNotVisible(loadingOverlay), timeoutInterval);
    const detailsTable = await driver.findElement(By.css(".detailsTable"));
    return detailsTable;
  }

  async function parseStationData(locationOption, stationOption, detailsTable) {
    const data = {
      location: await locationOption.getText(),
      station: await stationOption.getText(),
      precip: null,
      minTemp: null,
      avgTemp: null,
      maxTemp: null,
    };

    let precipIndex = -1;
    let minTempIndex = -1;
    let avgTempIndex = -1;
    let maxTempIndex = -1;

    const tableHeaders = await detailsTable.findElements(By.css("th"));
    const headerTexts = (await Promise.all(tableHeaders.map(async (x) => x.getText()))).filter(x => x.length > 0);

    for (let i = 0; i < headerTexts.length; i++) {
      switch (headerTexts[i]) {
        case "MONTH":
          break;
        case "PRECIP (IN)":
          precipIndex = i;
          data.precip = [];
          break;
        case "MIN TMP (°F)":
          minTempIndex = i;
          data.minTemp = [];
          break;
        case "AVG TMP (°F)":
          avgTempIndex = i;
          data.avgTemp = [];
          break;
        case "MAX TMP (°F)":
          maxTempIndex = i;
          data.maxTemp = [];
          break;
        case "":
          break;
        default:
          throw new Error("Unknown header: " + headerTexts[i]);
      }
    }

    const tableText = await detailsTable.getText();
    const lines = tableText.split("\n");

    if (lines.length !== 13) {
      throw new Error("Table does not contain 12 months.");
    }

    for (let i = 1; i < lines.length; i++) {
      const fields = lines[i].split(" ");
      for (let j = 0; j < fields.length; j++) {
        const field = fields[j];
        if (j === precipIndex) {
          data.precip.push(parseFloat(field));
        } else if (j === minTempIndex) {
          data.minTemp.push(parseFloat(field));
        } else if (j === avgTempIndex) {
          data.avgTemp.push(parseFloat(field));
        } else if (j === maxTempIndex) {
          data.maxTemp.push(parseFloat(field));
        }
      }
    }

    return data;
  }

  run();