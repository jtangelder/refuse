import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { RootComponent } from './ui/root';

bootstrapApplication(RootComponent, {
  providers: [provideAnimations()],
}).catch(err => console.error(err));
