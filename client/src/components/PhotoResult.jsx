export default function PhotoResult({ state }) {
  const result = state.lastResult;

  if (result && result.roundComplete) {
    return (
      <div className="screen result-screen">
        <h1>Round {result.round} complete!</h1>
        <p>Get ready for the next round...</p>
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
