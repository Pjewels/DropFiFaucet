let state = {
    channelClicked: false,
    currentStep: 'initial'
};

const joinChannelBtn = document.getElementById('joinChannel');
const proceedBtn = document.getElementById('proceedBtn');
const initialStep = document.getElementById('initialStep');
const faucetStep = document.getElementById('faucetStep');
const sendFaucetBtn = document.getElementById('sendFaucetBtn');
const addressInput = document.getElementById('addressInput');
const successMessage = document.getElementById('successMessage');
const txHash = document.getElementById('txHash');

document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    updateButtonStates();
});

function initializeEventListeners() {
    joinChannelBtn.addEventListener('click', handleJoinChannel);
    proceedBtn.addEventListener('click', handleProceed);
    sendFaucetBtn.addEventListener('click', handleSendFaucet);
}

function handleJoinChannel() {
    state.channelClicked = true;
    
    joinChannelBtn.textContent = '✓ Channel Joined';
    joinChannelBtn.classList.remove('btn-primary');
    joinChannelBtn.classList.add('btn-success');
    
    updateButtonStates();
    showNotification('Thanks for joining our channel!', 'success');
}

function handleProceed() {
    if (!state.channelClicked) {
        showNotification('Please join our Telegram channel first', 'warning');
        return;
    }

    state.currentStep = 'faucet';
    initialStep.classList.add('hidden');
    faucetStep.classList.remove('hidden');
    
    showNotification('Now choose your chain and enter your address', 'info');
}

async function handleSendFaucet() {
    const address = addressInput.value.trim();
    
    if (!address) {
        showNotification('Please enter a valid address', 'warning');
        addressInput.focus();
        return;
    }

    if (!address.startsWith('0x') || address.length !== 42) {
        showNotification('Please enter a valid Ethereum address', 'warning');
        addressInput.focus();
        return;
    }

    showNotification('Sending tokens to your address...', 'info');
    
    sendFaucetBtn.disabled = true;
    sendFaucetBtn.textContent = 'Sending...';
    
    try {
        const apiUrl = window.location.hostname === 'localhost' 
            ? 'http://localhost:3001/api/faucet/send'
            : '/api/faucet/send';
        
        console.log('Calling API:', apiUrl);
        console.log('Environment:', window.location.hostname);
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                address: address
            })
        });

        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers);
        
        const responseText = await response.text();
        console.log('Response text:', responseText);
        
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (parseError) {
            console.error('Failed to parse JSON response:', parseError);
            throw new Error(`Server returned invalid response: ${responseText.substring(0, 100)}...`);
        }
        
        console.log('Response data:', data);
        
        if (!response.ok) {
            throw new Error(data.message || `HTTP ${response.status}: ${response.statusText}`);
        }

        if (data.success) {
            txHash.textContent = data.txHash;
            txHash.href = `https://testnet.monadexplorer.com/tx/${data.txHash}`;
            successMessage.classList.remove('hidden');
            
            const successText = document.querySelector('.success-text');
            successText.textContent = `${data.amount} has been sent to your address`;
            
            sendFaucetBtn.textContent = '✓ Tokens Sent';
            sendFaucetBtn.classList.remove('btn-primary');
            sendFaucetBtn.classList.add('btn-success');
            
            showNotification(data.message, 'success');
        } else {
            sendFaucetBtn.disabled = false;
            sendFaucetBtn.textContent = 'Send my faucet';
            
            showNotification(data.message || 'Transaction failed. Please try again.', 'error');
        }
    } catch (error) {
        console.error('Error calling faucet API:', error);
        
        sendFaucetBtn.disabled = false;
        sendFaucetBtn.textContent = 'Send my faucet';
        
        let errorMessage = 'Network error: ';
        if (error.message.includes('Failed to fetch')) {
            errorMessage += 'Cannot connect to API.';
        } else if (error.message.includes('404')) {
            errorMessage += 'API endpoint not found.';
        } else if (error.message.includes('500')) {
            errorMessage += 'Server error.';
        } else {
            errorMessage += error.message;
        }
        errorMessage += ' Check console for details.';
        
        showNotification(errorMessage, 'error');
    }
}

function updateButtonStates() {
    if (state.channelClicked) {
        proceedBtn.disabled = false;
        proceedBtn.classList.remove('btn-disabled');
        proceedBtn.classList.add('btn-primary');
    }
}

function showNotification(message, type = 'info') {
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 1000;
        transform: translateX(100%);
        transition: transform 0.3s ease;
        max-width: 300px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    `;

    const colors = {
        info: '#3b82f6',
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444'
    };
    notification.style.backgroundColor = colors[type] || colors.info;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);

    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 4000);
}


const style = document.createElement('style');
style.textContent = `
    .btn-success {
        background-color: #10b981 !important;
        color: white !important;
        border-color: #10b981 !important;
    }
    
    .btn-success:hover:not(:disabled) {
        background-color: #059669 !important;
        border-color: #059669 !important;
    }
`;
document.head.appendChild(style); 