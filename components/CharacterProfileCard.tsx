import React from 'react';

interface CharacterProfileCardProps {
  name: string;
  description: string;
  keywords: string;
}

const CharacterProfileCard: React.FC<CharacterProfileCardProps> = ({ name, description, keywords }) => {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 transition-all duration-300 hover:shadow-lg hover:border-sky-600/50">
      <h3 className="text-lg font-bold text-sky-400 mb-2">{name}</h3>
      <div>
        <h4 className="text-sm font-semibold text-slate-300 mb-1 uppercase tracking-wider">Mô tả</h4>
        <p className="text-slate-400 text-sm whitespace-pre-wrap">{description}</p>
      </div>
      <div className="mt-3">
        <h4 className="text-sm font-semibold text-slate-300 mb-1 uppercase tracking-wider">Từ khóa AI</h4>
        <p className="text-slate-400 text-sm font-mono">{keywords}</p>
      </div>
    </div>
  );
};

export default CharacterProfileCard;
