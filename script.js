
// script.js

// === CONFIG ===
const routerAddress      = "0x06d8b6810edf37fc303f32f30ac149220c665c27";
const arenaRouterAddress = "0xF56D524D651B90E4B84dc2FffD83079698b9066E";
const WAVAX              = "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7";
const AVALANCHE_PARAMS   = {
  chainId:        '0xA86A',
  chainName:      'Avalanche C-Chain',
  nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
  rpcUrls:        ['https://api.avax.network/ext/bc/C/rpc'],
  blockExplorerUrls: ['https://snowtrace.io']
};

let walletConnectProvider = null;
let isWalletConnect = false;


// JSON-RPC provider (for blocks)
const rpc = new ethers.JsonRpcProvider(AVALANCHE_PARAMS.rpcUrls[0]);

// ABIs
const ABI = [
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[])",
  "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)",
  "function swapExactAVAXForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable",
  "function swapExactTokensForAVAXSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)"
];


const ERC20_ABI = [
  "function balanceOf(address) view returns(uint256)",
  "function approve(address spender,uint256 amount) returns(bool)",
  "function allowance(address owner,address spender) view returns(uint256)",
  "function decimals() view returns(uint8)"
];

// State
let provider, signer, router, arenaRouter, userAddress, currentAccount = null;
const tokenDecimals = {};
const tokens = [
  { symbol: "AVAX",  address: "AVAX", logo: "avaxlogo.png" },
  { symbol: "ARENA", address: "0xb8d7710f7d8349a506b75dd184f05777c82dad0c", logo: "arenalogo.png" },
  { symbol: "LAMBO", address: "0x6F43fF77A9C0Cf552b5b653268fBFe26A052429b", logo: "https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png" },
  { symbol: "WETH",  address: "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB", logo: "https://cryptologos.cc/logos/ethereum-eth-logo.png" },
  { symbol: "JOE",   address: "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd", logo: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanche/assets/0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd/logo.png" }
];

// === POPULATE TOKENS ===
async function populateTokens() {
  provider    = new ethers.BrowserProvider(window.ethereum);
  router      = new ethers.Contract(routerAddress, ABI, provider);
  arenaRouter = new ethers.Contract(arenaRouterAddress, ABI, provider);

  const inSel  = document.getElementById("tokenInSelect");
  const outSel = document.getElementById("tokenOutSelect");
  inSel.innerHTML  = "";
  outSel.innerHTML = "";

  for (const t of tokens) {
    const opt = document.createElement("option");
    opt.value     = JSON.stringify(t);
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

  inSel.selectedIndex  = 0;
  outSel.selectedIndex = 1;
  updateLogos();
}

// === UPDATE LOGOS ===
function updateLogos() {
  const inObj  = JSON.parse(document.getElementById("tokenInSelect").value);
  const outObj = JSON.parse(document.getElementById("tokenOutSelect").value);
  document.getElementById("inLogo").src        = inObj.logo;
  document.getElementById("inSymbol").innerText  = inObj.symbol;
  document.getElementById("outLogo").src       = outObj.logo;
  document.getElementById("outSymbol").innerText = outObj.symbol;
}

// === REVERSE TOKENS ===
function reverseTokens() {
  const inSel  = document.getElementById("tokenInSelect");
  const outSel = document.getElementById("tokenOutSelect");
  const tmp    = inSel.selectedIndex;
  inSel.selectedIndex  = outSel.selectedIndex;
  outSel.selectedIndex = tmp;
  updateLogos(); updateBalances(); updateEstimate();
}

// === CONNECT WALLET ===
async function connect() {
  const isMetaMask = typeof window.ethereum !== "undefined";

  try {
    if (isMetaMask) {
      // === Use MetaMask
      await window.ethereum.request({ method: "eth_requestAccounts" });

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
    } else {
      // === Use WalletConnect fallback
      walletConnectProvider = await WalletConnectEthereumProvider.init({
        projectId: "YOUR_PROJECT_ID", // Replace with your actual ID
        chains: [43114],
        showQrModal: true,
      });

      await walletConnectProvider.enable();

      provider = new ethers.BrowserProvider(walletConnectProvider);
      signer = await provider.getSigner();

      walletConnectProvider.on("disconnect", () => disconnect());
    }

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
    console.error("Wallet connection failed:", err);
    showToast("Connection failed", "error");
  }
}


// === SWITCH NETWORK ===
async function switchToAvalanche() {
  try {
    await ethereum.request({ method: "wallet_switchEthereumChain", params:[{chainId: AVALANCHE_PARAMS.chainId}] });
    location.reload();
  } catch (err) {
    if (err.code === 4902) {
      await ethereum.request({ method:"wallet_addEthereumChain", params:[AVALANCHE_PARAMS] });
      location.reload();
    } else {
      showToast("Switch network failed!", "error");
      console.error(err);
    }
  }
}

// === COPY ADDRESS INLINE ===
function copyAddress(e) {
  e.stopPropagation();
  navigator.clipboard.writeText(userAddress);
  e.target.innerText = "✅";
  showToast("Address copied!", "info");
  setTimeout(() => e.target.innerText = "📋", 1000);
}

// === UPDATE BALANCES ===
async function updateBalances() {
  if (!userAddress) return;
  const inObj  = JSON.parse(document.getElementById("tokenInSelect").value);
  const outObj = JSON.parse(document.getElementById("tokenOutSelect").value);

  async function getBal(t) {
    if (t.address === "AVAX") {
      return parseFloat(ethers.formatEther(await provider.getBalance(userAddress))).toFixed(4);
    }
    const c = new ethers.Contract(t.address, ERC20_ABI, provider);
    const b = await c.balanceOf(userAddress);
    return parseFloat(ethers.formatUnits(b, tokenDecimals[t.address])).toFixed(4);
  }

  document.getElementById("balanceIn").innerText  = "Balance: " + await getBal(inObj);
  document.getElementById("balanceOut").innerText = "Balance: " + await getBal(outObj);
}

// === UPDATE ESTIMATE ===
async function updateEstimate() {
  if (!provider) return;
  const amt = document.getElementById("tokenInAmount").value;
  if (!amt || isNaN(amt)) return;

  const inObj  = JSON.parse(document.getElementById("tokenInSelect").value);
  const outObj = JSON.parse(document.getElementById("tokenOutSelect").value);
  const path   = [
    inObj.address === "AVAX" ? WAVAX : inObj.address,
    outObj.address === "AVAX" ? WAVAX : outObj.address
  ];

  try {
    const res = await arenaRouter.getAmountsOut(ethers.parseUnits(amt, tokenDecimals[inObj.address]), path);
    const est = ethers.formatUnits(res[1], tokenDecimals[outObj.address]);
    document.getElementById("tokenOutAmount").value =
      outObj.address === "AVAX" ? parseFloat(est).toFixed(4) : Math.floor(parseFloat(est));
  } catch {
    document.getElementById("tokenOutAmount").value = "";
  }
}

// === SWAP ===
async function swap() {
  const amt     = document.getElementById("tokenInAmount").value;
  const inObj   = JSON.parse(document.getElementById("tokenInSelect").value);
  const outObj  = JSON.parse(document.getElementById("tokenOutSelect").value);
  const amountIn= ethers.parseUnits(amt, tokenDecimals[inObj.address]);
  const deadline= Math.floor(Date.now()/1000) + 600;
  const path    = [
    inObj.address === "AVAX" ? WAVAX : inObj.address,
    outObj.address === "AVAX" ? WAVAX : outObj.address
  ];

  try {
    if (inObj.address === "AVAX") {
      await router.swapExactAVAXForTokensSupportingFeeOnTransferTokens(0, path, userAddress, deadline, { value: amountIn });
    } else {
      const tC = new ethers.Contract(inObj.address, ERC20_ABI, signer);
      if ((await tC.allowance(userAddress, routerAddress)) < amountIn) {
        await tC.approve(routerAddress, ethers.MaxUint256);
      }
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

// === SET PERCENTAGE ===
function setPercentage(pct) {  
  const bal = parseFloat(document.getElementById("balanceIn").innerText.split(":")[1]);  
  if (isNaN(bal)) return;  
  const inObj = JSON.parse(document.getElementById("tokenInSelect").value);  
  const val   = inObj.address === "AVAX"  
                ? parseFloat((bal * pct/100).toFixed(4))  
                : Math.floor(bal * pct/100);  
  document.getElementById("tokenInAmount").value = val;  
  updateEstimate();  
}

// === SLIPPAGE TOGGLE ===
function toggleSlippage() {
  const pop = document.getElementById("slippagePopup");
  pop.style.display = pop.style.display === "block" ? "none" : "block";
}

// === TOKEN MODAL ===
let selectedField = null;
function openModal(f) {
  selectedField = f;
  document.getElementById("tokenModal").style.display = "flex";
  renderTokenList();
}
function closeModal() {
  document.getElementById("tokenModal").style.display = "none";
  document.getElementById("tokenSearch").value          = "";
}
function renderTokenList() {
  const list = document.getElementById("tokenList");
  list.innerHTML = "";
  tokens.forEach((t, i) => {
    const item = document.createElement("div");
    item.className = "token-item";
    item.onclick   = () => selectToken(t);
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
  const sel = selectedField === "in"
    ? document.getElementById("tokenInSelect")
    : document.getElementById("tokenOutSelect");
  [...sel.options].forEach((opt, i) => {
    if (JSON.parse(opt.value).address === token.address) sel.selectedIndex = i;
  });
  closeModal(); updateLogos(); updateBalances(); updateEstimate();
}
function filterTokens() {
  const q = document.getElementById("tokenSearch").value.toLowerCase();
  document.querySelectorAll("#tokenList .token-item").forEach((item, i) => {
    const t = tokens[i];
    item.style.display = (t.symbol.toLowerCase().includes(q) || t.address.toLowerCase().includes(q))
      ? "flex" : "none";
  });
}
function shorten(addr) {
  return addr === "AVAX" ? "AVAX" : addr.slice(0, 6) + "..." + addr.slice(-4);
}
function copyToClipboard(txt) {
  navigator.clipboard.writeText(txt);
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
  if (walletConnectProvider?.disconnect) {
    walletConnectProvider.disconnect();
  }

  provider = null;
  signer = null;
  walletConnectProvider = null;
  userAddress = null;
  currentAccount = null;
  isWalletConnect = false;

  document.getElementById("profileWrapper").style.display = "none";
  document.querySelector(".connect-btn").style.display = "inline-block";
  document.getElementById("walletAddress").innerText = "";
  document.getElementById("swapBtn").disabled = true;
  localStorage.removeItem("connected");

  showToast("Wallet disconnected", "info");
}

// === RECENT TRANSACTIONS PANEL & LOGIC ===
async function viewTransactions() {
  document.getElementById("profileContent").style.display = "none";
  document.getElementById("txDropdown").style.display = "flex";
  document.getElementById("txLoader").style.display = "block";
  document.getElementById("txList").style.display = "none";
  document.getElementById("txEmpty").style.display = "none";

  try {
    const resp = await fetch(
      `https://api.snowtrace.io/api` +
      `?module=account` +
      `&action=txlist` +
      `&address=${currentAccount}` +
      `&startblock=0` +
      `&endblock=99999999` +
      `&sort=desc`
    );
    const json = await resp.json();
    if (json.status !== '1') throw new Error(json.message);

    const routerTxs = json.result
      .filter(tx => tx.to.toLowerCase() === routerAddress.toLowerCase())
      .slice(0, 10);

    if (routerTxs.length) {
      renderTxList(routerTxs.map(tx => ({
        hash:      tx.hash,
        timeStamp: Number(tx.timeStamp),
        input:     tx.input // ✅ fix: include input for decoding
      })));
      document.getElementById('txList').style.display = 'block';
    } else {
      document.getElementById('txEmpty').style.display = 'block';
    }
  } catch (err) {
    console.error(err);
    document.getElementById('txEmpty').innerText = 'Failed to load transactions.';
    document.getElementById('txEmpty').style.display = 'block';
  } finally {
    document.getElementById('txLoader').style.display = 'none';
  }
}

async function renderTxList(txs) {
  const ul = document.getElementById('txList');
  ul.innerHTML = '';

  const fragments = ABI.map(sig => ethers.Fragment.from(sig));
  const iface = new ethers.Interface(fragments);

  txs.forEach(async (tx, index) => {
    const li = document.createElement('li');

    let fromToken = null, toToken = null;
    let amountIn = null, amountOut = null;

    try {
      const selector = tx.input.slice(0, 10);
      const fn = iface.getFunction(selector);
      const args = iface.decodeFunctionData(fn, tx.input);

      const path = args.path || [];
      if (Array.isArray(path) && path.length >= 2) {
        const fromAddr = path[0].toLowerCase();
        const toAddr = path[path.length - 1].toLowerCase();

        fromToken = tokens.find(t =>
          t.address.toLowerCase() === fromAddr ||
          (t.address === "AVAX" && fromAddr === WAVAX.toLowerCase())
        );
        toToken = tokens.find(t =>
          t.address.toLowerCase() === toAddr ||
          (t.address === "AVAX" && toAddr === WAVAX.toLowerCase())
        );
      }

      const receipt = await rpc.getTransactionReceipt(tx.hash);
      const logs = receipt.logs;
      const transferLogs = logs.filter(log =>
        log.topics[0] === ethers.id("Transfer(address,address,uint256)")
      );

      if (transferLogs.length >= 2) {
        const fromTransfer = transferLogs[0];
        const toTransfer = transferLogs[transferLogs.length - 1];

        const fromDecimals = tokenDecimals[fromToken?.address] || 18;
        const toDecimals = tokenDecimals[toToken?.address] || 18;

        amountIn = ethers.formatUnits(ethers.getUint(fromTransfer.data), fromDecimals);
        amountOut = ethers.formatUnits(ethers.getUint(toTransfer.data), toDecimals);
      }
    } catch (err) {
      console.warn("Could not decode tx:", tx.hash);
    }

    // === Build UI Card ===
    const wrapper = document.createElement('a');
    wrapper.href = `https://snowtrace.io/tx/${tx.hash}`;
    wrapper.target = "_blank";
    wrapper.style.textDecoration = "none";
    wrapper.style.width = "100%";

    const boxLeft = document.createElement('div');
    boxLeft.className = "tx-box-left";

    if (fromToken) {
      const logo1 = document.createElement('img');
      logo1.src = fromToken.logo;
      logo1.className = "token-logo";
      logo1.style.width = "20px";
      logo1.style.height = "20px";
      boxLeft.appendChild(logo1);
    }

    if (toToken) {
      const logo2 = document.createElement('img');
      logo2.src = toToken.logo;
      logo2.className = "token-logo";
      logo2.style.width = "20px";
      logo2.style.height = "20px";
      logo2.style.marginLeft = "4px";
      boxLeft.appendChild(logo2);
    }

    const boxRight = document.createElement('div');
    boxRight.className = "tx-box-right";
    boxRight.innerText = amountIn && amountOut
      ? `${parseFloat(amountIn).toFixed(4)} ${fromToken?.symbol || ''} → ${parseFloat(amountOut).toFixed(4)} ${toToken?.symbol || ''}`
      : "Swap";

    const card = document.createElement('div');
    card.style.display = "flex";
    card.style.justifyContent = "space-between";
    card.style.alignItems = "center";
    card.style.width = "100%";
    card.appendChild(boxLeft);
    card.appendChild(boxRight);

    wrapper.appendChild(card);
    li.appendChild(wrapper);

    // Hide txs after first 3
    if (index >= 3) {
      li.style.display = "none";
    }

    ul.appendChild(li);

    // Add "Show More" button once
    if (index === 2 && txs.length > 3) {
      const showMore = document.createElement("button");
      showMore.innerText = "Show More";
      showMore.className = "btn show-more-btn";
      showMore.onclick = () => {
        document.querySelectorAll('#txList li').forEach(li => li.style.display = "flex");
        showMore.style.display = "none";
      };
      ul.parentElement.appendChild(showMore);
    }
  });
}


function openTxBar() {
  document.getElementById('txDropdown').style.display = 'flex';
}
function closeTxBar() {
  // Restore the profile view
  document.getElementById("txDropdown").style.display = "none";
  document.getElementById("profileContent").style.display = "flex";
}

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
  if (localStorage.getItem("connected")) setTimeout(connect, 500);
});

window.addEventListener("click", (e) => {
  const menu = document.getElementById("profileMenu");
  if (!document.getElementById("profileWrapper").contains(e.target)) {
    menu.style.display = "none";
  }
});

// === GLOBAL SHORTCUTS ===
window.connect            = connect;
window.reverseTokens      = reverseTokens;
window.swap               = swap;
window.setPercentage      = setPercentage;
window.toggleSlippage     = toggleSlippage;
window.openModal          = openModal;
window.closeModal         = closeModal;
window.copyToClipboard    = copyToClipboard;
window.switchToAvalanche  = switchToAvalanche;
window.copyAddress        = copyAddress;
window.toggleProfileMenu  = toggleProfileMenu;
window.copyWallet         = copyWallet;
window.disconnect         = disconnect;
window.viewTransactions   = viewTransactions;
window.closeTxBar         = closeTxBar;
