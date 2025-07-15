// === CONFIG ===
const routerAddress = "0x06d8b6810edf37fc303f32f30ac149220c665c27"; // Your fee router
const arenaRouterAddress = "0xF56D524D651B90E4B84dc2FffD83079698b9066E"; // ArenaRouter for estimation
const WAVAX = "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7";
// Replace BrowserProvider with a JsonRpcProvider so we can call getHistory
const rpc = new ethers.JsonRpcProvider(AVALANCHE_PARAMS.rpcUrls[0]);

const AVALANCHE_PARAMS = {
  chainId: '0xA86A',
  chainName: 'Avalanche C-Chain',
  nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
  rpcUrls: ['https://api.avax.network/ext/bc/C/rpc'],
  blockExplorerUrls: ['https://snowtrace.io']
};

const ABI = [
  "function getAmountsOut(uint amountIn, address[] calldata path) view returns (uint[] memory)",
  "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline)",
  "function swapExactAVAXForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) payable",
  "function swapExactTokensForAVAXSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline)"
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

let provider, signer, router, arenaRouter, userAddress, currentAccount = null;
const tokenDecimals = {};

const tokens = [
  { symbol: "AVAX", address: "AVAX", logo: "avaxlogo.png" },
  { symbol: "ARENA", address: "0xb8d7710f7d8349a506b75dd184f05777c82dad0c", logo: "arenalogo.png" },
  { symbol: "LAMBO", address: "0x6F43fF77A9C0Cf552b5b653268fBFe26A052429b", logo: "https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png" },
  { symbol: "WETH", address: "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB", logo: "https://cryptologos.cc/logos/ethereum-eth-logo.png" },
  { symbol: "JOE", address: "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd", logo: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanche/assets/0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd/logo.png" }
];

// === POPULATE TOKENS ===
async function populateTokens() {
  provider = new ethers.BrowserProvider(window.ethereum);
  router = new ethers.Contract(routerAddress, ABI, provider);
  arenaRouter = new ethers.Contract(arenaRouterAddress, ABI, provider);

  const inSel = document.getElementById("tokenInSelect");
  const outSel = document.getElementById("tokenOutSelect");
  inSel.innerHTML = "";
  outSel.innerHTML = "";

  for (const t of tokens) {
    const opt = document.createElement("option");
    opt.value = JSON.stringify(t);
    opt.innerText = t.symbol;
    inSel.appendChild(opt.cloneNode(true));
    outSel.appendChild(opt.cloneNode(true));

    if (t.address !== "AVAX") {
      const c = new ethers.Contract(t.address, ERC20_ABI, provider);
      tokenDecimals[t.address] = await c.decimals();
    } else {
      tokenDecimals[t.address] = 18;
    }
  }

  inSel.selectedIndex = 0;
  outSel.selectedIndex = 1;
  updateLogos();
}

// === UPDATE LOGOS ===
function updateLogos() {
  const inObj = JSON.parse(document.getElementById("tokenInSelect").value);
  const outObj = JSON.parse(document.getElementById("tokenOutSelect").value);
  document.getElementById("inLogo").src = inObj.logo;
  document.getElementById("inSymbol").innerText = inObj.symbol;
  document.getElementById("outLogo").src = outObj.logo;
  document.getElementById("outSymbol").innerText = outObj.symbol;
}

// === REVERSE TOKENS ===
function reverseTokens() {
  const inSel = document.getElementById("tokenInSelect");
  const outSel = document.getElementById("tokenOutSelect");
  const tmp = inSel.selectedIndex;
  inSel.selectedIndex = outSel.selectedIndex;
  outSel.selectedIndex = tmp;
  updateLogos();
  updateBalances();
  updateEstimate();
}

// === WALLET CONNECT (UNIFIED) ===
async function connect() {
  if (!window.ethereum) {
    showToast("Please install MetaMask", "error");
    return;
  }
  try {
    const accounts = await ethereum.request({ method: "eth_requestAccounts" });
    const chainId = await ethereum.request({ method: "eth_chainId" });

    if (chainId !== AVALANCHE_PARAMS.chainId) {
      try {
        await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: AVALANCHE_PARAMS.chainId }] });
      } catch (err) {
        if (err.code === 4902) {
          await ethereum.request({ method: "wallet_addEthereumChain", params: [AVALANCHE_PARAMS] });
        } else {
          showToast("Please switch to Avalanche", "error");
          return;
        }
      }
    }

    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    router = new ethers.Contract(routerAddress, ABI, signer);
    arenaRouter = new ethers.Contract(arenaRouterAddress, ABI, provider);
    userAddress = await signer.getAddress();
    currentAccount = userAddress;

    document.querySelector(".connect-btn").style.display = "none";
    document.getElementById("profileWrapper").style.display = "flex";
    document.getElementById("walletAddress").innerText =
      userAddress.slice(0, 6) + "..." + userAddress.slice(-4);
    document.getElementById("swapBtn").disabled = false;

    localStorage.setItem("connected", "1");
    showToast("Wallet connected!", "success");

    updateBalances();
    updateEstimate();
  } catch (err) {
    console.error(err);
    showToast("Connection failed", "error");
  }
}

// === SWITCH NETWORK ===
async function switchToAvalanche() {
  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: AVALANCHE_PARAMS.chainId }]
    });
    location.reload();
  } catch (err) {
    if (err.code === 4902) {
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [AVALANCHE_PARAMS]
      });
      location.reload();
    } else {
      showToast("Switch network failed!", "error");
      console.error(err);
    }
  }
}

// === COPY INLINE ADDRESS ===
function copyAddress(e) {
  e.stopPropagation();
  navigator.clipboard.writeText(userAddress);
  const icon = e.target;
  icon.innerText = "✅";
  showToast("Address copied!", "info");
  setTimeout(() => (icon.innerText = "📋"), 1000);
}

// === GET & UPDATE BALANCES ===
async function updateBalances() {
  if (!userAddress) return;
  const inObj = JSON.parse(document.getElementById("tokenInSelect").value);
  const outObj = JSON.parse(document.getElementById("tokenOutSelect").value);

  async function getBal(t) {
    if (t.address === "AVAX") {
      return parseFloat(ethers.formatEther(await provider.getBalance(userAddress))).toFixed(4);
    }
    const c = new ethers.Contract(t.address, ERC20_ABI, provider);
    const b = await c.balanceOf(userAddress);
    return parseFloat(ethers.formatUnits(b, tokenDecimals[t.address])).toFixed(4);
  }

  document.getElementById("balanceIn").innerText = "Balance: " + await getBal(inObj);
  document.getElementById("balanceOut").innerText = "Balance: " + await getBal(outObj);
}

// === UPDATE ESTIMATE ===
async function updateEstimate() {
  if (!provider) return;
  const amt = document.getElementById("tokenInAmount").value;
  if (!amt || isNaN(amt)) return;

  const inObj = JSON.parse(document.getElementById("tokenInSelect").value);
  const outObj = JSON.parse(document.getElementById("tokenOutSelect").value);
  const decIn = tokenDecimals[inObj.address];
  const decOut = tokenDecimals[outObj.address];
  const path = [
    inObj.address === "AVAX" ? WAVAX : inObj.address,
    outObj.address === "AVAX" ? WAVAX : outObj.address
  ];

  try {
    const result = await arenaRouter.getAmountsOut(ethers.parseUnits(amt, decIn), path);
    const est = ethers.formatUnits(result[1], decOut);
    document.getElementById("tokenOutAmount").value =
      outObj.address === "AVAX" ? parseFloat(est).toFixed(4) : Math.floor(parseFloat(est));
  } catch {
    document.getElementById("tokenOutAmount").value = "";
  }
}

// === SWAP ===
async function swap() {
  const amt = document.getElementById("tokenInAmount").value;
  const slippage = parseFloat(document.getElementById("slippage").value);
  const inObj = JSON.parse(document.getElementById("tokenInSelect").value);
  const outObj = JSON.parse(document.getElementById("tokenOutSelect").value);
  const decIn = tokenDecimals[inObj.address];
  const amountIn = ethers.parseUnits(amt, decIn);
  const deadline = Math.floor(Date.now() / 1000) + 600;
  const path = [
    inObj.address === "AVAX" ? WAVAX : inObj.address,
    outObj.address === "AVAX" ? WAVAX : outObj.address
  ];

  try {
    if (inObj.address === "AVAX") {
      await router.swapExactAVAXForTokensSupportingFeeOnTransferTokens(0, path, userAddress, deadline, { value: amountIn });
    } else {
      const tokenC = new ethers.Contract(inObj.address, ERC20_ABI, signer);
      const allowance = await tokenC.allowance(userAddress, routerAddress);
      if (allowance < amountIn) await tokenC.approve(routerAddress, ethers.MaxUint256);
      if (outObj.address === "AVAX") {
        await router.swapExactTokensForAVAXSupportingFeeOnTransferTokens(amountIn, 0, path, userAddress, deadline);
      } else {
        await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(amountIn, 0, path, userAddress, deadline);
      }
    }
    showToast("Swap submitted!", "success");
  } catch (err) {
    console.error(err);
    showToast("Swap failed!", "error");
  }
}

// === SET PERCENTAGE INPUT ===
function setPercentage(pct) {
  const bal = parseFloat(document.getElementById("balanceIn").innerText.split(":")[1]);
  if (isNaN(bal)) return;
  const inObj = JSON.parse(document.getElementById("tokenInSelect").value);
  const val = (bal * pct / 100);
  document.getElementById("tokenInAmount").value =
    inObj.address === "AVAX" ? parseFloat(val).toFixed(4) : Math.floor(val);
  updateEstimate();
}

// === SLIPPAGE TOGGLE ===
function toggleSlippage() {
  const pop = document.getElementById("slippagePopup");
  pop.style.display = pop.style.display === "block" ? "none" : "block";
}

// === MODAL & TOKEN LIST ===
let selectedField = null;
function openModal(field) {
  selectedField = field;
  document.getElementById("tokenModal").style.display = "flex";
  renderTokenList();
}
function closeModal() {
  document.getElementById("tokenModal").style.display = "none";
  document.getElementById("tokenSearch").value = "";
}
function renderTokenList() {
  const list = document.getElementById("tokenList");
  list.innerHTML = "";
  tokens.forEach(t => {
    const item = document.createElement("div");
    item.className = "token-item";
    item.onclick = () => selectToken(t);
    item.innerHTML = `
      <div class="token-left">
        <img src="${t.logo}" class="token-logo" />
        <div>
          <div class="token-symbol">${t.symbol}</div>
          <div class="token-address">${shorten(t.address)}</div>
        </div>
      </div>
      <div class="copy-btn" onclick="event.stopPropagation(); copyToClipboard('${t.address}')">📋</div>
    `;
    list.appendChild(item);
  });
}
function selectToken(token) {
  const sel = selectedField === "in" ? document.getElementById("tokenInSelect") : document.getElementById("tokenOutSelect");
  [...sel.options].forEach((opt, i) => {
    if (JSON.parse(opt.value).address === token.address) sel.selectedIndex = i;
  });
  closeModal();
  updateLogos();
  updateBalances();
  updateEstimate();
}
function filterTokens() {
  const q = document.getElementById("tokenSearch").value.toLowerCase();
  document.querySelectorAll("#tokenList .token-item").forEach((item, i) => {
    const t = tokens[i];
    item.style.display = (t.symbol.toLowerCase().includes(q) || t.address.toLowerCase().includes(q)) ? "flex" : "none";
  });
}
function shorten(addr) {
  return addr === "AVAX" ? "AVAX" : addr.slice(0, 6) + "..." + addr.slice(-4);
}
function copyToClipboard(text) {
  navigator.clipboard.writeText(text);
  showToast("Copied to clipboard", "info");
}

// === PROFILE DROPDOWN ===
function toggleProfileMenu() {
  const menu = document.getElementById("profileMenu");
  menu.style.display = menu.style.display === "flex" ? "none" : "flex";
}
function copyWallet() {
  if (currentAccount) {
    navigator.clipboard.writeText(currentAccount);
    showToast("Copied wallet address!", "success");
  }
}
function disconnect() {
  localStorage.removeItem("connected");
  currentAccount = null;
  document.getElementById("profileWrapper").style.display = "none";
  document.querySelector(".connect-btn").style.display = "inline-block";
  showToast("Wallet disconnected", "info");
}

async function viewTransactions() {
  openTxBar();

  // 1. Fetch full history for this account
  const history = await rpc.getHistory(currentAccount);

  // 2. Keep only calls *to* your router
  const routerTxs = history
    .filter(tx => tx.to && tx.to.toLowerCase() === routerAddress.toLowerCase())
    .slice(-10)               // last 10
    .reverse();               // newest at top

  // 3. For each tx, fetch its block timestamp
  const detailed = await Promise.all(
    routerTxs.map(async tx => {
      const block = await rpc.getBlock(tx.blockNumber);
      return { hash: tx.hash, timeStamp: block.timestamp };
    })
  );

function renderTxList(txs) {
  const ul = document.getElementById('txList');
  ul.innerHTML = '';

  txs.forEach(tx => {
    const li = document.createElement('li');
    // link to Snowtrace for full details
    const a = document.createElement('a');
    a.href   = `https://snowtrace.io/tx/${tx.hash}`;
    a.target = '_blank';
    a.innerText = tx.hash;
    // nicely formatted timestamp
    const tm = document.createElement('time');
    tm.innerText = new Date(tx.timeStamp * 1000).toLocaleString();
    li.append(a, tm);
    ul.appendChild(li);
  });
}
function openTxBar() {
  document.getElementById('txBar').classList.add('open');
}
function closeTxBar() {
  document.getElementById('txBar').classList.remove('open');
}
window.closeTxBar = closeTxBar;


// === TOAST ===
function showToast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerText = msg;
  document.getElementById('toastContainer').appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// === EVENT LISTENERS ===
window.addEventListener("DOMContentLoaded", async () => {
  await populateTokens();
  if (localStorage.getItem("connected")) await connect();
});

window.addEventListener("click", (e) => {
  const menu = document.getElementById("profileMenu");
  if (!document.getElementById("profileWrapper").contains(e.target)) {
    menu.style.display = "none";
  }
});

document.getElementById("tokenInAmount").addEventListener("input", (e) => {
  let v = e.target.value.replace(/[^0-9.]/g, '');
  const parts = v.split('.');
  if (parts.length > 2) v = parts[0] + '.' + parts[1];
  const inObj = JSON.parse(document.getElementById("tokenInSelect").value);
  if (inObj.address === "AVAX") {
    if (parts[1] && parts[1].length > 4) parts[1] = parts[1].substring(0,4);
    e.target.value = parts.join('.');
  } else {
    e.target.value = parts[0];
  }
  updateEstimate();
});



document.getElementById("tokenInSelect").addEventListener("change", () => { updateLogos(); updateBalances(); updateEstimate(); });
document.getElementById("tokenOutSelect").addEventListener("change", () => { updateLogos(); updateBalances(); updateEstimate(); });

window.connect = connect;
window.reverseTokens = reverseTokens;
window.swap = swap;
window.setPercentage = setPercentage;
window.toggleSlippage = toggleSlippage;
window.openModal = openModal;
window.closeModal = closeModal;
window.copyToClipboard = copyToClipboard;
window.switchToAvalanche = switchToAvalanche;
window.copyAddress = copyAddress;
window.toggleProfileMenu = toggleProfileMenu;
window.copyWallet = copyWallet;
window.disconnect = disconnect;
window.viewTransactions = viewTransactions;
