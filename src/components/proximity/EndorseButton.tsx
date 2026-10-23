interface EndorseButtonProps {
  onClick: () => void;
  count: number;
}

export default function EndorseButton({ onClick, count }: EndorseButtonProps) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-primary">
      +1 ({count})
    </button>
  );
}
