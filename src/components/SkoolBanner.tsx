function SkoolBanner() {
  const handleJoinCommunity = () => {
    chrome.tabs.create({ 
      url: 'https://aoknowledge.com' 
    })
  }

  return (
    <div
      className="border-b px-3 py-1"
      style={{
        backgroundColor: '#1b1c1e',
        borderColor: 'rgba(252, 223, 62, 0.28)'
      }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-xs font-medium"
          style={{ color: '#f6dc4b' }}
        >
          Entourez-vous des meilleurs
        </span>
        
        <button
          onClick={handleJoinCommunity}
          className="px-2.5 py-0.5 text-xs font-semibold rounded transition-colors hover:opacity-90"
          style={{
            backgroundColor: '#fcdf3e',
            color: '#111111'
          }}
        >
          Rejoins-nous
        </button>
      </div>
    </div>
  )
}

export default SkoolBanner
