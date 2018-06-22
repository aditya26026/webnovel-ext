// get our TOC
let storage;
chrome.storage.local.get(["toc"], (res) => {
    storage = res.toc;
    console.log("TOC obtained from Local Storage!");
});

const INTERVAL_CHAPTER_CHECK = 1000;
const INTERVAL_TOKEN_CHECK = 100;

// Check for new chapters
function main() {
    Array.from(
        // Locked chapters.
        document.querySelectorAll('.cha-content._lock:not(._iterated)')
    ).forEach((lock) => {
        // Add this class so this chapter won't be processed the next time
        // `main` is called.
        lock.classList.add('_iterated');

        // Check if it is a premium novel
        const premiumCheckElement = lock.parentNode.querySelector(".iso-area");
        if (premiumCheckElement && premiumCheckElement.dataset && premiumCheckElement.dataset.vtype === "2") {
            return handlePremium(lock);
        }
        return handleNonPremium(lock);
    });
}

function formatContent(content) {
    let chapterHTML = content;
    // const chapterHtml = content
    //     .split('\n')
    //     .map(p => p.trim())
    //     .filter(p => !!p)
    //     .map(p => `<p>${p}</p>`)
    //     .join('');   
    chapterHTML = chapterHTML.split(/.*Chapter \d+:.+\n+.*Translator:.+/)[1] || chapterHTML;
    chapterHTML = marked(chapterHTML);
    return chapterHTML;
}

function getCookie(name) {
    var value = "; " + document.cookie;
    var parts = value.split("; " + name + "=");
    if (parts.length == 2) return parts.pop().split(";").shift();
}

function decipher(pass, cipher) {
    // PrivateBin actually compress their data so we need to decompress
    const decompress = function (data) {
        return Base64.btou(RawDeflate.inflate(Base64.fromBase64(data)));
    }
    // We need to decrypt the data too
    // the cipher is actually a JSON string
    // containing an object of data needed to decipher
    // the pass is a string, can be found after the # in the privatebin link
    const decrypted = sjcl.decrypt(pass, cipher);
    return decompress(decrypted);
}

function isInDescRange(chapNumber, link) {
    const [start, end] = link.desc.split("-").map(Number);
    return chapNumber >= start && chapNumber <= end;
}

function findChapIndex(chapNumber, link) {
    const [start, end] = link.desc.split("-").map(Number);
    return isInDescRange(chapNumber, link) ? (chapNumber - start + 1) : 0;
}

// credit to noisypixy on NU forum for this
// should probably rewrite this to use async functions in the future
function handleNonPremium(lock) {
    // For styling, remove the _lock class
    lock.classList.remove("_lock");

    // Remove the video.
    const v = lock.closest('.chapter_content').querySelector('.lock-video');
    if (v) {
        v.remove();
    }

    // Element with the chapter content.
    const contentElement = lock.querySelector('.cha-words');

    contentElement.style.opacity = '0.1';

    // Get the ID for the series ("book").
    // Some chapters have the `data-bid` property, but not all of them.
    // That's why it's better to just get this from the URL.
    const bid = window.location.href.split('/book/')[1].split('/')[0];

    // Get the ID for the chapter.
    const { cid } = lock.querySelector('[data-cid]').dataset;

    // Both ID are required.
    if (!bid || !cid) {
        return;
    }

    return fetch(
        `https://www.webnovel.com/apiajax/chapter/GetChapterContentToken?bookId=${bid}&chapterId=${cid}&_csrfToken=${getCookie("_csrfToken")}`
        , { credentials: "include" })
        .then(resp => resp.json())
        .then(data => {
            return data.data.token
        })
        .then(token => encodeURIComponent(token))
        .then(token => new Promise((resolve) => {
            // The raw body of the chapter.
            //
            // It will be plain text, so we must manually build the HTML for it.
            let content = '';

            // Try to get the content of the chapter, and fulfill the promise once
            // we have it.
            //
            // This function will retry until it succeeds.
            function tick() {
                if (token) {
                    const url = `https://www.webnovel.com/apiajax/chapter/GetChapterContentByToken?token=${token}&_csrfToken=${getCookie("_csrfToken")}`;
                    fetch(url, { credentials: "include" })
                        .then(resp => resp.json())
                        .then((data) => {
                            content = data.data.content.trim();
                            if (content) {
                                resolve(content);
                            } else {
                                setTimeout(tick, INTERVAL_TOKEN_CHECK);
                            }
                        })
                        .catch((err) => {
                            console.error(err.stack);
                            tick();
                        });
                }
            }

            tick();
        }))
        .then((content) => {
            // Build the HTML for the chapter content.
            const chapterHtml = formatContent(content);
            // Update the chapter content and turn opacity back to 100%.
            contentElement.innerHTML = chapterHtml;
            contentElement.style.opacity = "1";
        })
        .catch((err) => {
            console.error(err);
        });
}

function handlePremium(chap) {
    // get book info / title
    const bookTitle = document.querySelectorAll(".dib.ell.vam.c_strong")[0].getAttribute("title");
    const found = storage.find((novel) => novel.name === bookTitle);
    // If this is not a premium novel or at least not available on Reddit
    if (!found) {
        // just return out
        return;
    }
    // get the previous sibling aka the title element
    const titleElement = chap.previousElementSibling;
    const chapNumber = titleElement.children[0].innerText.split(" ")[1].slice(0, -1);
    // check if we have this chapternumber available
    const linkObj = found.links.find((link) => link.desc === chapNumber || isInDescRange(chapNumber, link));
    if (!linkObj) {
        // just return out again;
        return;
    }
    else {
        console.log("Found an available premium chapter.");
    }
    // find out our chap Index in range if it is indeed in range
    const chapIndex = findChapIndex(chapNumber, linkObj);
    // because there is someone using a link other than .fr
    // and it is a pain to add it, ill just alert the guy
    // nevermind let's just add a global permission
    // if (!linkObj.link.includes("imirhil.fr")) {
    //     alert(`${chapNumber} is not supported because it uses a link other than imirhil.fr!`);
    //     return;
    // }
    // change the Unlock Chapter Button
    const lockArea = chap.nextElementSibling.querySelector(".lock-area");
    // remove the locked chapter part
    chap.nextElementSibling.querySelector(".iso-hd").remove();
    chap.querySelector(".g_ad_ph").remove();
    // change the top text
    lockArea.querySelector(".cost-row").innerText = "Found Chapter Online!";
    // change the button
    const button = lockArea.querySelector("a");
    button.classList.remove("j_unlockChapter");
    button.style.backgroundColor = "#7E57C2";
    button.innerText = "Fetch Chapter";

    // manage the content element
    const contentElement = chap.querySelector('.cha-words');

    // add our listener
    button.addEventListener("click", generateButtonHandler(linkObj, contentElement, lockArea, chap, chapIndex));
}

// since every button should have its own unique
// link, we should generate unique event handler for each
function generateButtonHandler(linkObj, contentElement, lockArea, chap, chapIndex) {
    return function (event) {
        console.log("Fetching data!");
        contentElement.style.opacity = "0.1";
        fetchPaste(linkObj.link).then((data) => {
            console.log("Successfully Fetched!");
            let chapterData = decipher(linkObj.key, data.data);
            // if it's not a singular paster
            if (chapIndex !== 0) {
                // get the individual chapters
                chapterData = chapterData.split(/.*Chapter \d+:.+\n+.*Translator:.+/g).slice(1)[chapIndex - 1] || chapterData;
            }
            // format it
            contentElement.innerHTML = formatContent(chapterData);
            // reset the opacity
            contentElement.style.opacity = "1";
            lockArea.remove();
            // remove the _lock class since we are done
            // this is for styling purpose only
            chap.classList.remove("_lock");
            // scroll it into view and top of it
            chap.scrollIntoView(true);
        }).catch(err => console.error(err));
    };
}

// fetch our paste
async function fetchPaste(link) {
    return await (await fetch(link, { headers: { "X-Requested-With": "JSONHttpRequest" } })).json();
}

// Since Qidian may load new chapters without refreshing the page, we must
// continuously check for new chapters in the page.
setInterval(main, INTERVAL_CHAPTER_CHECK);