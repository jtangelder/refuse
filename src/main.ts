import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { App } from './ui/app';

bootstrapApplication(App, {
  providers: [provideAnimations()],
}).catch(err => console.error(err));
