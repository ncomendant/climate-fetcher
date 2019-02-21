const {Builder, By, Key, until} = require('selenium-webdriver');
const fs = require("fs");

const logPath = "log.txt";
const url = "https://www.ncdc.noaa.gov/cdo-web/datatools/normals";
const timeoutInterval = 10000;
let driver = null;

async function init() {
  const reader = new LogReader();
  const log = await reader.readLog();
  const data = reader.parseLog(log);

  const summaries = summarize(data);
  const filteredSummaries = filterSummaries(summaries, {
    minLow: 40,
    minHigh: 60,
    maxHigh: 100,
  });

  for (let summary of filteredSummaries) {
    const minHighString = (summary.minHigh != null) ? summary.minHigh.toFixed(0) : "N/A";
    const maxHighString = (summary.maxHigh != null) ? summary.maxHigh.toFixed(0) : "N/A";
    const minLowString = (summary.minLow != null) ? summary.minLow.toFixed(0) : "N/A";
    console.log(`${minHighString}-${maxHighString}\t${minLowString}\t${summary.location}\t${summary.station}`);
  }
  console.log(`\nResults found: ${filteredSummaries.length}`);
}

function filterSummaries(summaries, options) {
  return summaries.filter((x) => {
    if (options.minLow != null && x.minLow < options.minLow) {
      return false;
    }
    if (options.minHigh != null && x.minHigh < options.minHigh) {
      return false;
    }
    if (options.maxHigh != null && x.maxHigh > options.maxHigh) {
      return false;
    }
    return true;
  });
}

function summarize(data) {
  const result = [];
  for (let item of data) {
    result.push({
      location: item.location,
      station: item.station,
      precip: avg(item.precip),
      minLow: min(item.minTemp),
      maxLow: max(item.minTemp),
      minHigh: min(item.maxTemp),
      maxHigh: max(item.maxTemp),
    });
  }
  return result;
}

function avg(arr) {
  if (arr == null || arr.length === 0) return null;
  let sum = 0;
  for (let item of arr) {
    sum += item;
  }
  return sum/arr.length;
}

function max(arr) {
  if (arr == null || arr.length === 0) return null;
  let result = arr[0];
  for (let item of arr) {
    if (item > result) {
      result = item;
    }
  }
  return result;
}

function min(arr) {
  if (arr == null || arr.length === 0) return null;
  let result = arr[0];
  for (let item of arr) {
    if (item < result) {
      result = item;
    }
  }
  return result;
}

class LogReader {
  async readFile(path) {
    return new Promise((resolve, reject) => {
      fs.readFile(path, 'utf8', (err, contents) => {
        if (err != null) {
          reject(err);
        }
        resolve(contents);
      });
    });
  }
  
  async readLog() {
    return await this.readFile(logPath);
  }
  
  parseLog(log) {
    const data = [];
    const lines = log.split("\n");
    for (let line of lines) {
      const fields = line.split("\t");
      if (fields.length !== 6) {
        continue;
      }
      data.push({
        location: fields[0].trim(),
        station: fields[1].trim(),
        precip: (fields[2].length > 0) ? fields[2].split(",").map(x => parseFloat(x)) : null,
        minTemp: (fields[3].length > 0) ? fields[3].split(",").map(x => parseFloat(x)) : null,
        avgTemp: (fields[4].length > 0) ? fields[4].split(",").map(x => parseFloat(x)) : null,
        maxTemp: (fields[5].length > 0) ? fields[5].split(",").map(x => parseFloat(x)) : null,
      });
    }
    return data;
  }
}

class ClimateFetcher {

  constructor() {
    console.log("hi");
  }

  async run() {
    driver = await new Builder().forBrowser('chrome').build();
    await this.resume(0, 0);
  }

  async resume(locationIndex, stationIndex) {
    let i = locationIndex;
    let j = stationIndex;
    try {
      await driver.get(url);
      const loadingOverlay = await this.getLoadingOverlay();
      await driver.wait(until.elementIsNotVisible(loadingOverlay), timeoutInterval);
      const locations = await this.getLocationOptions();
      while (i < locations.length) {
        const location = locations[i];
        const stations = await this.getStationOptions(location, loadingOverlay);
        while (j < stations.length) {
          const station = stations[j];
          const detailsTable = await this.getDetailsTable(station, loadingOverlay);
          const stationData = await this.parseStationData(location, station, detailsTable);
          await this.logStationData(stationData);
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

  async log(data) {
    return new Promise((resolve, reject) => {
      fs.appendFile(logPath, data, 'utf8', () => {
        resolve();
      });
    });
  }


  async logStationData(stationData) {
    const location = stationData.location;
    const station = stationData.station;
    const precipField = (stationData.precip) ? stationData.precip.join(",") : "";
    const minTempField = (stationData.minTemp) ? stationData.minTemp.join(",") : "";
    const avgTempField = (stationData.avgTemp) ? stationData.avgTemp.join(",") : "";
    const maxTempField = (stationData.maxTemp) ? stationData.maxTemp.join(",") : "";
    await this.log(`${location}\t${station}\t${precipField}\t${minTempField}\t${avgTempField}\t${maxTempField}\n`);
  }

  async getLoadingOverlay() {
    const loadingOverlay = await driver.findElement(By.css(".loadingOverlay"));
    return loadingOverlay;
  }

  async getLocationOptions() {
    const locationSelect = await driver.findElement(By.css(".locationSelect"));
    const locationOptions = await locationSelect.findElements(By.css("option"));
    return locationOptions;
  }

  async getStationOptions(locationOption, loadingOverlay) {
    await locationOption.click();
    await driver.wait(until.elementIsNotVisible(loadingOverlay), timeoutInterval);
    const stationSelect = await driver.findElement(By.css(".stationSelect"));
    const stationOptions = await stationSelect.findElements(By.css("option"));
    return stationOptions;
  }

  async getDetailsTable(stationOption, loadingOverlay) {
    await stationOption.click();
    await driver.wait(until.elementIsNotVisible(loadingOverlay), timeoutInterval);
    const detailsTable = await driver.findElement(By.css(".detailsTable"));
    return detailsTable;
  }

  async parseStationData(locationOption, stationOption, detailsTable) {
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
}

  init();