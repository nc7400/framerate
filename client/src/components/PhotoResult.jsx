export default function PhotoResult({ state }) {
  const result = state.lastResult;

  if (result && result.roundComplete) {
    const bestPhotos = result.bestPhotos || [];
    const isTie = bestPhotos.length > 1;
    return (
      <div className="screen result-screen">
        <h1>{result.final ? 'Final round complete!' : `Round ${result.round} complete!`}</h1>

        {bestPhotos.length > 0 && (
          <div className="best-photo">
            <h2>{isTie ? 'Best photos of the round — it\'s a tie!' : 'Best photo of the round'}</h2>
            <div className={isTie ? 'best-photo-grid tie' : 'best-photo-grid'}>
              {bestPhotos.map((photo) => (
                <div className="best-photo-item" key={photo.url}>
                  <img className="result-photo" src={photo.url} alt={`${photo.ownerUsername}'s photo`} />
                  <p className="points">{photo.ownerUsername}</p>
                  <p className="hint">
                    {photo.points} points · average {photo.average.toFixed(1)}/5
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <p>
          {result.final
            ? 'The game is over — final scores coming up...'
            : 'Get ready for the next round...'}
        </p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="screen result-screen">
        <h1>...</h1>
      </div>
    );
  }

  return (
    <div className="screen result-screen">
      <h1>{result.ownerUsername}'s photo</h1>
      <img className="result-photo" src={result.photoUrl} alt="Result" />
      <p className="points">
        +{result.pointsAwarded} points (round ×{result.multiplier})
      </p>
    </div>
  );
}
