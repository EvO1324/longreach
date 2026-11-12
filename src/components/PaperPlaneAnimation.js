/*
Longreach, a crew centre for virtual airlines on Infinite Flight.
Copyright (C) 2026 Alex Evans

Licensed under the PolyForm Noncommercial License 1.0.0. You should have
received a copy of the licence with this program (LICENSE.md). If not, see
<https://polyformproject.org/licenses/noncommercial/1.0.0>.
*/

import React from 'react';
import { Lottie } from 'lottie-react';
import paperPlaneData from '../assets/lottie/paper-plane.json';

function PaperPlaneAnimation({ size = 32, loop = true }) {
  return (
    <Lottie
      src={paperPlaneData}
      autoplay
      loop={loop}
      style={{ width: size, height: size, flexShrink: 0 }}
    />
  );
}

export default PaperPlaneAnimation;
