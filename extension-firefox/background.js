chrome.runtime.onInstalled.addListener(function () {
    chrome.alarms.create("refreshTOC", {
        delayInMinutes: 180,
        periodInMinutes: 180
    });
    populateStorage();
});

chrome.alarms.onAlarm.addListener(function(alarm) {
    console.log("Alarm Triggered!");
    if(alarm.name === "refreshTOC") {
        populateStorage();
    }
});

async function populateStorage() {
    const z = parseJSON(await fetchJSON());
    console.log(z);
    // populate the storage from the JSON data
    chrome.storage.local.set({
        toc: z
    }, (res) => console.log("Storage value is set!"));
    return;
}

async function fetchJSON() {
    return await (await fetch("https://www.reddit.com/r/QidianUnderground/wiki/autotoc.json")).json();
}

function parseJSON(json) {
    // annoying thing :(
    const markdownData = json.data && json.data.content_md;
    if (markdownData) {
        return makeNovelObject(getLinks(chunk(flatten(parseMarkdown(markdownData)).slice(1), 2)));
    }
}

function parseMarkdown(mdString) {
    return mdString.split("\n\n*").map((a) => a.split("\n\n").filter((a) => !a.includes("#####")).map(a => a.trim()));
}

function getLinks(arr) {
    return arr.map((novel) => {
        novel[1] = novel[1].split("|").map((link) => parseMarkdownLink(link.trim()));
        return novel;
    });
}

function parseMarkdownLink(linkStr) {
    let linkRegex = /\[([^\[\]]+)\]\(([^)]+)\)/g;
    const [, desc, linkData] = linkRegex.exec(linkStr);
    const [link, key] = linkData.split("#");
    return {desc, link, key};
}

function makeNovelObject(arr) {
    return arr.map((novel) => {
        const [name, links] = novel;
        return { name, links };
    })
}

// helpers
function chunk(arr, len) {
    let chunks = [],
        i = 0,
        n = arr.length;
    while (i < n) {
        chunks.push(arr.slice(i, i += len));
    }
    return chunks;
}

function flatten(arr, result = []) {
    for (let i = 0, length = arr.length; i < length; i++) {
        const value = arr[i];
        if (Array.isArray(value)) {
            flatten(value, result);
        } else {
            result.push(value);
        }
    }
    return result;
}
